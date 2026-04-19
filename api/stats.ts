import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  Client,
  isFullPage,
  type PageObjectResponse,
  type QueryDataSourceParameters,
} from "@notionhq/client";

/** Data source IDs (collection://… in Notion OS). Database page IDs differ. */
const DEFAULT_COMPANIES_DS = "5c5b0b22-d824-4662-8f6e-fa0dc4791da2";
const DEFAULT_OPPORTUNITIES_DS = "0134167b-980f-4bd2-9855-a65f1411bac5";
const DEFAULT_PROJECTS_DS = "59cda2ad-65e3-44d4-aa4b-2fd7fc215890";

function getTitle(props: PageObjectResponse["properties"], key: string): string {
  const p = props[key];
  if (p?.type === "title" && Array.isArray(p.title)) {
    return p.title.map((t) => t.plain_text).join("");
  }
  return "";
}

function getSelect(
  props: PageObjectResponse["properties"],
  key: string
): string | null {
  const p = props[key];
  if (p?.type === "select") return p.select?.name ?? null;
  if (p?.type === "status") return p.status?.name ?? null;
  return null;
}

function getNumber(
  props: PageObjectResponse["properties"],
  key: string
): number | null {
  const p = props[key];
  if (p?.type === "number" && typeof p.number === "number") return p.number;
  if (p?.type === "number" && p.number === null) return null;
  return null;
}

function getDateStart(
  props: PageObjectResponse["properties"],
  key: string
): string | null {
  const p = props[key];
  if (p?.type === "date" && p.date?.start) return p.date.start;
  return null;
}

async function queryAllDataSourcePages(
  client: Client,
  dataSourceId: string,
  filter?: QueryDataSourceParameters["filter"]
) {
  const results: PageObjectResponse[] = [];
  let cursor: string | undefined;
  for (;;) {
    const res = await client.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
      ...(filter ? { filter } : {}),
    });
    for (const item of res.results) {
      if (isFullPage(item)) results.push(item);
    }
    if (!res.has_more) break;
    cursor = res.next_cursor ?? undefined;
  }
  return results;
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function wonDealDate(page: PageObjectResponse): Date {
  const expected = getDateStart(page.properties, "Expected Close Date");
  if (expected) return startOfDay(new Date(expected));
  return new Date(page.last_edited_time);
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    res.status(500).json({
      error:
        "Missing NOTION_TOKEN. Add it in Vercel env or .env.local for vercel dev.",
    });
    return;
  }

  const companiesDs =
    process.env.NOTION_COMPANIES_DATA_SOURCE_ID ?? DEFAULT_COMPANIES_DS;
  const opportunitiesDs =
    process.env.NOTION_OPPORTUNITIES_DATA_SOURCE_ID ??
    DEFAULT_OPPORTUNITIES_DS;
  const projectsDs =
    process.env.NOTION_PROJECTS_DATA_SOURCE_ID ?? DEFAULT_PROJECTS_DS;

  const client = new Client({ auth: token });

  try {
    const wonFilter: QueryDataSourceParameters["filter"] = {
      property: "Stage",
      select: { equals: "Won" },
    };

    const [companyPages, opportunityPages, projectPages] = await Promise.all([
      queryAllDataSourcePages(client, companiesDs),
      queryAllDataSourcePages(client, opportunitiesDs, wonFilter),
      queryAllDataSourcePages(client, projectsDs),
    ]);

    const currentLeads = companyPages.filter(
      (p) => getSelect(p.properties, "Status") === "Lead"
    ).length;

    const createdByMonth = new Map<string, number>();
    const now = new Date();
    const horizon = new Date(now);
    horizon.setMonth(horizon.getMonth() - 24);
    for (const p of companyPages) {
      const c = new Date(p.created_time);
      if (c < horizon) continue;
      const k = monthKey(p.created_time);
      createdByMonth.set(k, (createdByMonth.get(k) ?? 0) + 1);
    }
    const companiesCreatedByMonth = Array.from(createdByMonth.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const quarterStart = new Date(now.getFullYear(), quarterStartMonth, 1);

    const yearStart = new Date(now.getFullYear(), 0, 1);
    const last30 = new Date(now);
    last30.setDate(last30.getDate() - 30);

    let sales30 = 0;
    let salesQtd = 0;
    let salesYtd = 0;
    let salesAll = 0;

    for (const p of opportunityPages) {
      const v = getNumber(p.properties, "Value") ?? 0;
      salesAll += v;
      const d = wonDealDate(p);
      if (d >= last30) sales30 += v;
      if (d >= quarterStart) salesQtd += v;
      if (d >= yearStart) salesYtd += v;
    }

    let mrr = 0;
    const activeStatuses = new Set(["Planning", "Active", "Ongoing"]);
    const activeProjects: {
      id: string;
      name: string;
      status: string | null;
      type: string | null;
      mrr: number | null;
      totalValue: number | null;
    }[] = [];

    for (const p of projectPages) {
      const status = getSelect(p.properties, "Status");
      const m = getNumber(p.properties, "MRR");
      if (status === "Ongoing" && m != null) mrr += m;

      if (status && activeStatuses.has(status)) {
        activeProjects.push({
          id: p.id,
          name: getTitle(p.properties, "Name"),
          status,
          type: getSelect(p.properties, "Type"),
          mrr: getNumber(p.properties, "MRR"),
          totalValue: getNumber(p.properties, "Total Value"),
        });
      }
    }

    activeProjects.sort((a, b) => a.name.localeCompare(b.name));

    res.setHeader(
      "Cache-Control",
      "s-maxage=60, stale-while-revalidate=120"
    );
    res.status(200).json({
      generatedAt: new Date().toISOString(),
      currentLeads,
      companiesCreatedByMonth,
      mrr,
      sales: {
        last30Days: sales30,
        quarterToDate: salesQtd,
        yearToDate: salesYtd,
        allTime: salesAll,
      },
      activeProjects: {
        count: activeProjects.length,
        projects: activeProjects,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
