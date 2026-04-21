import { NextResponse } from "next/server";
import {
  Client,
  isFullPage,
  type PageObjectResponse,
  type QueryDataSourceParameters,
} from "@notionhq/client";

import type { XeroStatsBlock } from "@/lib/types";
import { fetchXeroDashboardSlice, xeroEnvConfigured } from "@/lib/xero-stats";

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

function getRichTextPlain(
  props: PageObjectResponse["properties"],
  key: string
): string {
  const p = props[key];
  if (p?.type === "rich_text" && Array.isArray(p.rich_text)) {
    return p.rich_text.map((t) => t.plain_text).join("");
  }
  return "";
}

/** Stage on opportunities (select or status). */
function getOppStage(props: PageObjectResponse["properties"]): string | null {
  return getSelect(props, "Stage") ?? getSelect(props, "Deal stage");
}

function wonDealDate(page: PageObjectResponse): Date {
  const expected = getDateStart(page.properties, "Expected Close Date");
  if (expected) {
    const d = new Date(expected);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return new Date(page.last_edited_time);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function isWonStage(stage: string | null): boolean {
  if (!stage) return false;
  return stage.toLowerCase() === "won";
}

function isClosedLostStage(stage: string | null): boolean {
  if (!stage) return false;
  const s = stage.toLowerCase();
  if (s === "won") return true;
  return ["lost", "closed", "disqualified", "churned", "unqualified"].some(
    (k) => s === k || s.includes(k)
  );
}

/** Open pipeline: not won/lost/closed. */
function isOpenPipelineStage(stage: string | null): boolean {
  if (!stage) return true;
  return !isClosedLostStage(stage);
}

/** Proposal / quote / negotiation — “out” chasing signature. */
function isProposalsOutStage(stage: string | null): boolean {
  if (!stage) return false;
  const s = stage.toLowerCase();
  if (isWonStage(stage) || s === "lost") return false;
  return (
    s.includes("proposal") ||
    s.includes("proposed") ||
    s.includes("quote") ||
    s.includes("sent") ||
    s.includes("negotiat") ||
    s.includes("contract")
  );
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

function firstRelationId(
  props: PageObjectResponse["properties"],
  keys: string[]
): string | null {
  for (const key of keys) {
    const p = props[key];
    if (p?.type === "relation" && p.relation[0]?.id) return p.relation[0].id;
  }
  return null;
}

function opportunityCompanyName(
  page: PageObjectResponse,
  companyById: Map<string, string>
): string {
  const props = page.properties;
  const id = firstRelationId(props, ["Company", "Client", "Account", "Organisation"]);
  if (id) return companyById.get(id) ?? "—";
  const t = getRichTextPlain(props, "Company") || getRichTextPlain(props, "Client");
  if (t) return t;
  return getTitle(props, "Name") || "—";
}

function projectClientName(
  page: PageObjectResponse,
  companyById: Map<string, string>
): string {
  const props = page.properties;
  const id = firstRelationId(props, ["Company", "Client", "Account"]);
  if (id) return companyById.get(id) ?? "—";
  const t = getRichTextPlain(props, "Client") || getRichTextPlain(props, "Company");
  if (t) return t;
  return "—";
}

function projectEndDate(props: PageObjectResponse["properties"]): string | null {
  return (
    getDateStart(props, "End Date") ??
    getDateStart(props, "Delivery Date") ??
    getDateStart(props, "Due Date") ??
    null
  );
}

function projectArFields(props: PageObjectResponse["properties"]): {
  amount: number | null;
  daysOverdue: number | null;
} {
  const amount =
    getNumber(props, "AR") ??
    getNumber(props, "Accounts Receivable") ??
    getNumber(props, "Balance Due") ??
    getNumber(props, "Outstanding");
  const daysOverdue =
    getNumber(props, "Days overdue") ?? getNumber(props, "AR days overdue");
  return {
    amount: amount != null && amount > 0 ? amount : null,
    daysOverdue: daysOverdue != null ? daysOverdue : null,
  };
}

const MAX_TABLE_ROWS = 10;
const PROPOSAL_AGE_ALERT_DAYS = 10;

export async function GET() {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Missing NOTION_TOKEN. Add it to .env.local." },
      { status: 500 }
    );
  }

  const companiesDs =
    process.env.NOTION_COMPANIES_DATA_SOURCE_ID ?? DEFAULT_COMPANIES_DS;
  const opportunitiesDs =
    process.env.NOTION_OPPORTUNITIES_DATA_SOURCE_ID ?? DEFAULT_OPPORTUNITIES_DS;
  const projectsDs =
    process.env.NOTION_PROJECTS_DATA_SOURCE_ID ?? DEFAULT_PROJECTS_DS;

  const client = new Client({ auth: token });

  try {
    const [companyPages, opportunityPages, projectPages] = await Promise.all([
      queryAllDataSourcePages(client, companiesDs),
      queryAllDataSourcePages(client, opportunitiesDs),
      queryAllDataSourcePages(client, projectsDs),
    ]);

    const companyById = new Map<string, string>();
    for (const p of companyPages) {
      companyById.set(p.id, getTitle(p.properties, "Name") || "—");
    }

    const now = new Date();
    const monthStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let mrr = 0;

    const activeStatuses = new Set(["Planning", "Active", "Ongoing"]);
    const activeProjectRows: {
      project: string;
      client: string;
      status: string | null;
      endDate: string | null;
    }[] = [];

    for (const p of projectPages) {
      const status = getSelect(p.properties, "Status");
      const m = getNumber(p.properties, "MRR");

      if (status === "Ongoing" && m != null) {
        mrr += m;
      }

      if (status && activeStatuses.has(status)) {
        activeProjectRows.push({
          project: getTitle(p.properties, "Name") || "—",
          client: projectClientName(p, companyById),
          status,
          endDate: projectEndDate(p.properties),
        });
      }
    }

    activeProjectRows.sort((a, b) => {
      if (!a.endDate && !b.endDate) return a.project.localeCompare(b.project);
      if (!a.endDate) return 1;
      if (!b.endDate) return -1;
      return a.endDate.localeCompare(b.endDate);
    });

    let pipelineValue = 0;
    let pipelineDealCount = 0;
    let proposalsOutCount = 0;
    let proposalsOutValue = 0;
    let newOpps7d = 0;
    let wonMtdCount = 0;
    let wonMtdValue = 0;

    const proposalRows: {
      company: string;
      value: number;
      stageAgeDays: number;
      stageAgeAlert: boolean;
      expectedClose: string | null;
    }[] = [];

    for (const p of opportunityPages) {
      const stage = getOppStage(p.properties);
      const v = getNumber(p.properties, "Value") ?? 0;
      const created = new Date(p.created_time);

      if (isOpenPipelineStage(stage) && !isWonStage(stage)) {
        pipelineValue += v;
        pipelineDealCount += 1;
      }

      if (isProposalsOutStage(stage)) {
        proposalsOutCount += 1;
        proposalsOutValue += v;
        const lastEdit = new Date(p.last_edited_time);
        const stageAgeDays = Math.max(0, daysBetween(now, lastEdit));
        const stageAgeAlert = stageAgeDays > PROPOSAL_AGE_ALERT_DAYS;
        proposalRows.push({
          company: opportunityCompanyName(p, companyById),
          value: v,
          stageAgeDays,
          stageAgeAlert,
          expectedClose: getDateStart(p.properties, "Expected Close Date"),
        });
      }

      if (created >= sevenDaysAgo) {
        newOpps7d += 1;
      }

      if (isWonStage(stage)) {
        const d = wonDealDate(p);
        if (d >= monthStart && d <= now) {
          wonMtdCount += 1;
          wonMtdValue += v;
        }
      }
    }

    proposalRows.sort((a, b) => b.stageAgeDays - a.stageAgeDays);

    let arOutstanding: number | null = null;
    let arAlert = false;
    for (const p of projectPages) {
      const { amount, daysOverdue } = projectArFields(p.properties);
      if (amount != null) {
        arOutstanding = (arOutstanding ?? 0) + amount;
        if (daysOverdue != null && daysOverdue > 30) arAlert = true;
      }
    }
    if (arOutstanding === 0) arOutstanding = null;

    const audFmt = new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
    });
    const wonMtdStr =
      wonMtdValue <= 0
        ? "No wins MTD"
        : `+${audFmt.format(wonMtdValue)} won MTD`;

    const mrrPositiveHighlight = wonMtdValue > 0;

    const xero: XeroStatsBlock = xeroEnvConfigured()
      ? await fetchXeroDashboardSlice()
      : { disabled: true };

    const oldProposalCount = proposalRows.filter((r) => r.stageAgeAlert).length;
    let todaysFocus: string | null = null;
    if (oldProposalCount >= 1) {
      todaysFocus = `${oldProposalCount} proposal${oldProposalCount === 1 ? "" : "s"} over ${PROPOSAL_AGE_ALERT_DAYS} days old`;
    } else if (arAlert && arOutstanding != null) {
      todaysFocus = `AR needs attention (${audFmt.format(arOutstanding)})`;
    }

    return NextResponse.json(
      {
        generatedAt: now.toISOString(),
        todaysFocus,
        xero,
        hero: {
          mrr,
          mrrSubline: wonMtdStr,
          mrrPositiveHighlight,
          pipelineValue,
          pipelineDealCount,
        },
        activity: {
          proposalsOutCount,
          proposalsOutValue,
          newOpps7d,
          wonMtdCount,
          wonMtdValue,
          arOutstanding,
          arAlert,
        },
        proposalsOut: proposalRows.slice(0, MAX_TABLE_ROWS),
        activeProjects: activeProjectRows.slice(0, MAX_TABLE_ROWS),
      },
      {
        headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" },
      }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
