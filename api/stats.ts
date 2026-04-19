import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Client } from "@notionhq/client";
import type {
  PageObjectResponse,
  PartialPageObjectResponse,
  QueryDatabaseParameters,
} from "@notionhq/client/build/src/api-endpoints";

const DEFAULT_COMPANIES = "3d6ad3f6-dd53-429d-9e48-00a942ac4e87";
const DEFAULT_OPPORTUNITIES = "628797e3-2b04-4a26-b7b8-639ea1fff775";
const DEFAULT_PROJECTS = "9d0645bc-2cd8-4930-9bc8-2c9fb25e8814";

function isFullPage(
  p: PageObjectResponse | PartialPageObjectResponse
): p is PageObjectResponse {
  return "properties" in p && !!p.properties;
}

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

async function queryAllPages(
  client: Client,
  databaseId: string,
  filter?: QueryDatabaseParameters["filter"]
) {
  const results: PageObjectResponse[] = [];
  let cursor: string | undefined;
  for (;;) {
    const res = await client.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
      ...(filter ? { filter } : {}),
    });
    for (const p of res.results) {
      if (isFullPage(p)) results.push(p);
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
      error: "Missing NOTION_TOKEN. Add it in Vercel env or .env.local for vercel dev.",
    });
    return;
  }

  const companiesId =
    process.env.NOTION_COMPANIES_DB_ID ?? DEFAULT_COMPANIES;
  const opportunitiesId =
    process.env.NOTION_OPPORTUNITIES_DB_ID ?? DEFAULT_OPPORTUNITIES;
  const projectsId = process.env.NOTION_PROJECTS_DB_ID ?? DEFAULT_PROJECTS;

  const client = new Client({ auth: token, notionVersion: "2022-06-28" });

  try {
    const [companyPages, opportunityPages, projectPages] = await Promise.all([
      queryAllPages(client, companiesId),
      queryAllPages(client, opportunitiesId, {
        property: "Stage",
        select: { equals: "Won" },
      }),
      queryAllPages(client, projectsId),
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
