import { XeroClient } from "xero-node";

import type { XeroStatsBlock } from "./types";

const DEFAULT_TZ = "Australia/Sydney";

/**
 * Xero P&amp;L `periods` is the number of **comparison** periods (max 11). The report includes the **base**
 * period plus those comparisons — e.g. `timeframe=MONTH` and `periods=11` yields **12 monthly columns**
 * (1 base + 11). We run a second request anchored earlier to fill the 24‑month chart.
 */
const XERO_PNL_COMPARISON_PERIODS = 11;
/** Base + comparison periods = total monthly amount columns per report. */
const XERO_PNL_MONTHLY_COLUMNS = XERO_PNL_COMPARISON_PERIODS + 1;

type XeroSuccess = Exclude<XeroStatsBlock, { error: string } | { disabled: true }>;

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function zonedYMD(d: Date, timeZone: string): { y: number; m: number; day: number } {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const [y, m, day] = s.split("-").map((x) => parseInt(x, 10));
  return { y, m, day };
}

function ymdString(y: number, m: number, day: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addCalendarMonths(y: number, m: number, delta: number): { y: number; m: number } {
  let nm = m + delta;
  let ny = y;
  while (nm > 12) {
    nm -= 12;
    ny += 1;
  }
  while (nm < 1) {
    nm += 12;
    ny -= 1;
  }
  return { y: ny, m: nm };
}

function monthLabel(y: number, m: number): string {
  return new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, 1))
  );
}

/** Start of the fiscal quarter immediately before the current one (AU FY quarters). */
function previousAuFiscalQuarterStartYmd(cy: number, cm: number): { y: number; m: number; day: number } {
  const cur = auFiscalQuarterStartYmd(cy, cm);
  if (cur.m === 7) return { y: cy, m: 4, day: 1 };
  if (cur.m === 10) return { y: cy, m: 7, day: 1 };
  if (cur.m === 1) return { y: cy - 1, m: 10, day: 1 };
  return { y: cy, m: 1, day: 1 };
}

/** Australian FY Jul 1 – Jun 30: July 1 of the FY that contains this calendar month. */
function auFinancialYearStartYmd(y: number, m: number): { y: number; m: number; day: number } {
  if (m >= 7) return { y, m: 7, day: 1 };
  return { y: y - 1, m: 7, day: 1 };
}

/** Fiscal quarters within AU FY: Q1 Jul–Sep, Q2 Oct–Dec, Q3 Jan–Mar, Q4 Apr–Jun. */
function auFiscalQuarterStartYmd(y: number, m: number): { y: number; m: number; day: number } {
  if (m >= 7 && m <= 9) return { y, m: 7, day: 1 };
  if (m >= 10 && m <= 12) return { y, m: 10, day: 1 };
  if (m >= 1 && m <= 3) return { y, m: 1, day: 1 };
  return { y, m: 4, day: 1 };
}

function auFiscalQuarterIndex(m: number): 1 | 2 | 3 | 4 {
  if (m >= 7 && m <= 9) return 1;
  if (m >= 10 && m <= 12) return 2;
  if (m >= 1 && m <= 3) return 3;
  return 4;
}

function auFiscalQuarterEndYm(cy: number, cm: number): { y: number; m: number } {
  if (cm >= 7 && cm <= 9) return { y: cy, m: 9 };
  if (cm >= 10 && cm <= 12) return { y: cy, m: 12 };
  if (cm >= 1 && cm <= 3) return { y: cy, m: 3 };
  return { y: cy, m: 6 };
}

const MONTH_LONG_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_SHORT_EN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function buildCashPeriodLabels(cy: number, cm: number) {
  const cashMtdPeriodLabel = `${MONTH_LONG_EN[cm - 1]} ${cy}`;
  const qs = auFiscalQuarterStartYmd(cy, cm);
  const qe = auFiscalQuarterEndYm(cy, cm);
  const qn = auFiscalQuarterIndex(cm);
  const cashQtdPeriodLabel = `Q${qn} · ${MONTH_SHORT_EN[qs.m - 1]} – ${MONTH_SHORT_EN[qe.m - 1]} ${qe.y}`;
  const fys = auFinancialYearStartYmd(cy, cm);
  const cashFyPeriodLabel = `FY ${fys.y}–${String(fys.y + 1).slice(-2)}`;
  return { cashMtdPeriodLabel, cashQtdPeriodLabel, cashFyPeriodLabel };
}

type BareCell = { value?: string; Value?: string };
type BareRow = {
  rowType?: string | number;
  RowType?: string | number;
  title?: string;
  Title?: string;
  cells?: BareCell[];
  Cells?: BareCell[];
  rows?: BareRow[];
  Rows?: BareRow[];
};

function cellStr(c: BareCell | undefined): string {
  const s = c?.value ?? c?.Value;
  return s == null ? "" : String(s).trim();
}

function parseMoney(s: string): number {
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s);
  let t = neg ? s.slice(1, -1) : s.trim();
  t = t.replace(/[$\s]/g, "");
  if (t.includes(",") && t.includes(".")) {
    if (t.lastIndexOf(",") > t.lastIndexOf(".")) {
      t = t.replace(/\./g, "").replace(",", ".");
    } else {
      t = t.replace(/,/g, "");
    }
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) {
    t = t.replace(/,/g, "");
  } else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) {
    t = t.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}

function rowTypeName(r: BareRow): string {
  const rt = r.rowType ?? r.RowType;
  if (rt === undefined || rt === null) return "";
  if (typeof rt === "number") {
    const names = ["Header", "Section", "Row", "SummaryRow"];
    return names[rt] ?? "";
  }
  return String(rt);
}

function getCells(r: BareRow): BareCell[] {
  const c = r.cells ?? r.Cells;
  return Array.isArray(c) ? c : [];
}

function getChildRows(r: BareRow): BareRow[] {
  const rr = r.rows ?? r.Rows;
  return Array.isArray(rr) ? rr : [];
}

function walkRows(rows: BareRow[] | undefined, fn: (r: BareRow) => void): void {
  if (!rows) return;
  for (const r of rows) {
    fn(r);
    walkRows(getChildRows(r), fn);
  }
}

function getTopRows(body: unknown): BareRow[] {
  if (!body || typeof body !== "object") return [];
  const o = body as Record<string, unknown>;
  if (Array.isArray(o.rows)) return o.rows as BareRow[];
  if (Array.isArray(o.Rows)) return o.Rows as BareRow[];
  const reps = o.reports ?? o.Reports;
  if (Array.isArray(reps) && reps.length > 0 && typeof reps[0] === "object") {
    const r0 = reps[0] as Record<string, unknown>;
    if (Array.isArray(r0.rows)) return r0.rows as BareRow[];
    if (Array.isArray(r0.Rows)) return r0.Rows as BareRow[];
  }
  return [];
}

function collectRowsFlat(body: unknown): BareRow[] {
  const top = getTopRows(body);
  const out: BareRow[] = [];
  walkRows(top, (r) => out.push(r));
  return out;
}

/** Parse header cell text to YYYY-MM (Xero AU formats vary). */
function parseMonthKeyFromLabel(label: string): string | null {
  const t = label.trim();
  if (!t) return null;

  const iso = t.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (iso) return `${iso[1]}-${iso[2]}`;

  const dmy = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const a = parseInt(dmy[1], 10);
    const b = parseInt(dmy[2], 10);
    const y = parseInt(dmy[3], 10);
    let mo: number;
    let day: number;
    if (a > 12) {
      day = a;
      mo = b;
    } else if (b > 12) {
      mo = a;
      day = b;
    } else {
      day = a;
      mo = b;
    }
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(mo).padStart(2, "0")}`;
    }
  }

  const monFirst = t.match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i
  );
  if (monFirst) {
    const idx = MONTH_SHORT_EN.findIndex((x) => monFirst[1].toLowerCase().startsWith(x.slice(0, 3).toLowerCase()));
    if (idx >= 0) {
      return `${monFirst[2]}-${String(idx + 1).padStart(2, "0")}`;
    }
  }

  if (/^\d{6}$/.test(t)) {
    return `${t.slice(0, 4)}-${t.slice(4, 6)}`;
  }

  const d = new Date(t);
  if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2000) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return null;
}

function rowPrimaryLabel(r: BareRow): string {
  const t = String(r.title ?? r.Title ?? "").trim();
  if (t) return t;
  return cellStr(getCells(r)[0]);
}

function isSummaryRow(r: BareRow): boolean {
  return rowTypeName(r).toLowerCase() === "summaryrow";
}

/**
 * Xero P&amp;L rolls up the Income section to a single **SummaryRow** labelled “Total Income”
 * (or “Total Revenue”). We pick that row, ignoring subsections like “Total Operating Income”.
 */
function findTotalIncomeRow(flat: BareRow[]): BareRow | undefined {
  const norm = (r: BareRow) => rowPrimaryLabel(r).replace(/\s+/g, " ").trim().toLowerCase();
  const summaries = flat.filter(isSummaryRow);

  for (const r of summaries) if (norm(r) === "total income") return r;
  for (const r of summaries) if (norm(r) === "total revenue") return r;
  for (const r of summaries) {
    const x = norm(r);
    if (/total\s+operating\s+income/.test(x)) continue;
    if (/total\s+income/.test(x)) return r;
  }
  for (const r of flat) if (!isSummaryRow(r) && norm(r) === "total income") return r;
  return undefined;
}

/**
 * Collect every `Header` row in document order. Xero sometimes emits multiple header rows
 * (e.g. a report title row plus a column-label row).
 */
function collectHeaderRows(body: unknown): BareRow[] {
  const out: BareRow[] = [];
  walkRows(getTopRows(body), (r) => {
    if (rowTypeName(r).toLowerCase() === "header") out.push(r);
  });
  return out;
}

/** Header row whose amount-cells parse as months most often; tiebreak prefers the last one. */
function findMonthLabelHeaderRow(body: unknown): BareRow | undefined {
  const headers = collectHeaderRows(body);
  let best: BareRow | undefined;
  let bestN = -1;
  for (const h of headers) {
    const cells = getCells(h);
    let n = 0;
    for (let i = 1; i < cells.length; i++) {
      if (parseMonthKeyFromLabel(cellStr(cells[i]))) n++;
    }
    if (n >= bestN) {
      bestN = n;
      best = h;
    }
  }
  return best;
}

/**
 * Build `YYYY-MM → Total Income` from a Xero P&amp;L report. Xero returns monthly columns
 * in **reverse chronological order**: amount cell **index 1 = anchor month**, index 2 = previous
 * month, etc. We honour header labels when they parse; otherwise we fall back to that positional
 * contract (not a `.slice(-12)` — that reverses the order and historically caused MTD to show an
 * old month's value).
 */
function extractMonthlyTotalIncomeMap(
  body: unknown,
  anchorY: number,
  anchorM: number
): Map<string, number> {
  const out = new Map<string, number>();
  const flat = collectRowsFlat(body);
  const ti = findTotalIncomeRow(flat);
  if (!ti) return out;

  const vCells = getCells(ti).slice(1);
  if (vCells.length === 0) return out;

  const header = findMonthLabelHeaderRow(body);
  const hCells = header ? getCells(header).slice(1) : [];
  const headerKeys = hCells.map((c) => parseMonthKeyFromLabel(cellStr(c)));

  const n = Math.min(vCells.length, XERO_PNL_MONTHLY_COLUMNS);

  for (let i = 0; i < n; i++) {
    const headerKey = i < headerKeys.length ? headerKeys[i] : null;
    const { y, m } = addCalendarMonths(anchorY, anchorM, -i);
    const key = headerKey ?? yearMonthKey(y, m);
    out.set(key, parseMoney(cellStr(vCells[i])));
  }
  return out;
}

function yearMonthKey(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Inclusive sum of map values for each calendar month from (sy,sm) through (ey,em). */
function sumMapMonthRange(
  map: Map<string, number>,
  sy: number,
  sm: number,
  ey: number,
  em: number
): number {
  let s = 0;
  let y = sy;
  let m = sm;
  for (;;) {
    if (y > ey || (y === ey && m > em)) break;
    s += map.get(yearMonthKey(y, m)) ?? 0;
    if (y === ey && m === em) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return s;
}

function sumNMonthsFrom(map: Map<string, number>, startY: number, startM: number, n: number): number {
  let s = 0;
  let y = startY;
  let m = startM;
  for (let i = 0; i < n; i++) {
    s += map.get(yearMonthKey(y, m)) ?? 0;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return s;
}

/** Months from AU FY start (July) through (cy, cm), inclusive. */
function monthsElapsedInCurrentFy(cy: number, cm: number): number {
  const fys = auFinancialYearStartYmd(cy, cm);
  let n = 0;
  let y = fys.y;
  let m = 7;
  for (;;) {
    n++;
    if (y === cy && m === cm) return n;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
}

/**
 * All hero metrics from merged monthly P&amp;L maps (two API windows × up to 12 months each ≈ 24 months chart).
 * % comparables use calendar months: prior month column, full prior quarter (3 mo), prior FY same month-count.
 */
function derivePnlHeroFromMonthlyMap(
  map: Map<string, number>,
  cy: number,
  cm: number
): {
  mtd: number;
  priorMtd: number;
  qtd: number;
  priorQtd: number;
  fyYtd: number;
  priorFyYtd: number;
} {
  const fys = auFinancialYearStartYmd(cy, cm);
  const qss = auFiscalQuarterStartYmd(cy, cm);
  const prevQStart = previousAuFiscalQuarterStartYmd(cy, cm);
  const pm = addCalendarMonths(cy, cm, -1);

  const mtd = map.get(yearMonthKey(cy, cm)) ?? 0;
  const priorMtd = map.get(yearMonthKey(pm.y, pm.m)) ?? 0;
  const qtd = sumMapMonthRange(map, qss.y, qss.m, cy, cm);
  const priorQtd = sumNMonthsFrom(map, prevQStart.y, prevQStart.m, 3);
  const fyYtd = sumMapMonthRange(map, fys.y, 7, cy, cm);
  const n = monthsElapsedInCurrentFy(cy, cm);
  const priorFyYtd = sumNMonthsFrom(map, fys.y - 1, 7, n);

  return { mtd, priorMtd, qtd, priorQtd, fyYtd, priorFyYtd };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isXero429(e: unknown): boolean {
  if (typeof e === "string") {
    try {
      const p = JSON.parse(e) as { response?: { statusCode?: number } };
      return p?.response?.statusCode === 429;
    } catch {
      return false;
    }
  }
  if (e && typeof e === "object" && "response" in e) {
    const r = (e as { response?: { status?: number; statusCode?: number } }).response;
    return r?.status === 429 || r?.statusCode === 429;
  }
  return false;
}

/** Xero limits concurrent connections; 429 is common if many reports run at once. */
async function withXeroRetry<T>(fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isXero429(e) || attempt === maxAttempts - 1) throw e;
      const backoffMs = 600 * 2 ** attempt;
      await sleep(backoffMs);
    }
  }
  throw last;
}

function mergeIncomeMonthMaps(older: Map<string, number>, newer: Map<string, number>): Map<string, number> {
  const out = new Map(older);
  for (const [k, v] of newer) out.set(k, v);
  return out;
}

/** YYYY-MM-DD for the first and last day of the anchor month. Used as `fromDate` / `toDate`. */
function anchorMonthRange(y: number, m: number): { from: string; to: string } {
  const from = ymdString(y, m, 1);
  const to = ymdString(y, m, daysInMonth(y, m));
  return { from, to };
}

async function fetchPnlMonthlyMaps(
  xero: XeroClient,
  tenantId: string,
  anchorY: number,
  anchorM: number
): Promise<{ cash: Map<string, number>; accrual: Map<string, number> }> {
  /**
   * Xero P&amp;L contract (see API docs): request the **anchor month** as the base period
   * (`fromDate` = day 1, `toDate` = last day) and `periods=11&timeframe=MONTH`. The report then
   * returns **12 monthly columns**, newest → oldest, starting at the anchor month.
   */
  const fetchChunk = (paymentsOnly: boolean, y: number, m: number) => {
    const { from, to } = anchorMonthRange(y, m);
    return withXeroRetry(() =>
      xero.accountingApi.getReportProfitAndLoss(
        tenantId,
        from,
        to,
        XERO_PNL_COMPARISON_PERIODS,
        "MONTH",
        undefined,
        undefined,
        undefined,
        undefined,
        true,
        paymentsOnly
      )
    );
  };

  const w2 = addCalendarMonths(anchorY, anchorM, -XERO_PNL_MONTHLY_COLUMNS);

  const [cashW1, accW1, cashW2, accW2] = await Promise.all([
    fetchChunk(true, anchorY, anchorM),
    fetchChunk(false, anchorY, anchorM),
    fetchChunk(true, w2.y, w2.m),
    fetchChunk(false, w2.y, w2.m),
  ]);

  const cash1 = extractMonthlyTotalIncomeMap(cashW1.body, anchorY, anchorM);
  const accrual1 = extractMonthlyTotalIncomeMap(accW1.body, anchorY, anchorM);
  const cash2 = extractMonthlyTotalIncomeMap(cashW2.body, w2.y, w2.m);
  const accrual2 = extractMonthlyTotalIncomeMap(accW2.body, w2.y, w2.m);

  return {
    cash: mergeIncomeMonthMaps(cash2, cash1),
    accrual: mergeIncomeMonthMaps(accrual2, accrual1),
  };
}

async function paginateInvoices(
  xero: XeroClient,
  tenantId: string,
  where: string
): Promise<NonNullable<Awaited<ReturnType<XeroClient["accountingApi"]["getInvoices"]>>["body"]["invoices"]>> {
  const out: NonNullable<
    Awaited<ReturnType<XeroClient["accountingApi"]["getInvoices"]>>["body"]["invoices"]
  > = [];
  let page = 1;
  let pageCount = 1;
  while (page <= pageCount) {
    const { body } = await withXeroRetry(() =>
      xero.accountingApi.getInvoices(
        tenantId,
        undefined,
        where,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        page,
        false,
        undefined,
        undefined,
        false,
        100
      )
    );
    const batch = body.invoices ?? [];
    out.push(...batch);
    pageCount = body.pagination?.pageCount ?? 1;
    page += 1;
  }
  return out;
}

/** Custom Connection only: single org, `client_credentials` grant (no refresh token). */
export function xeroEnvConfigured(): boolean {
  return Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);
}

function redactBearerInString(s: string): string {
  return s.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]");
}

/** xero-node rejects with a JSON string for many API failures; axios errors are plain objects. */
function formatXeroCatch(e: unknown): string {
  if (typeof e === "string") {
    try {
      const p = JSON.parse(e) as {
        body?: { Message?: string; Type?: string };
        response?: {
          statusCode?: number;
          body?: { Message?: string };
          headers?: Record<string, string | undefined>;
        };
      };
      const code = p?.response?.statusCode;
      if (code === 429) {
        const prob =
          p?.response?.headers?.["x-rate-limit-problem"] ??
          p?.response?.headers?.["X-Rate-Limit-Problem"];
        return `Xero rate limit (429)${prob ? ` — ${prob}` : ""}. Wait a few seconds and refresh.`;
      }
      const msg = p?.body?.Message ?? p?.response?.body?.Message;
      if (msg) return code != null ? `${msg} (HTTP ${code})` : msg;
      const compact = redactBearerInString(JSON.stringify(p));
      return compact.length > 1200 ? `${compact.slice(0, 1200)}…` : compact;
    } catch {
      return redactBearerInString(e);
    }
  }
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "response" in e) {
    const r = (e as { response?: { data?: unknown; status?: number; statusText?: string } }).response;
    if (r?.data != null) {
      return typeof r.data === "string" ? r.data : JSON.stringify(r.data);
    }
    if (r?.status != null) {
      return `HTTP ${r.status}${r.statusText ? ` ${r.statusText}` : ""}`;
    }
  }
  try {
    return redactBearerInString(JSON.stringify(e));
  } catch {
    return String(e);
  }
}

export async function fetchXeroDashboardSlice(): Promise<XeroStatsBlock> {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const tz = process.env.XERO_REPORTING_TIMEZONE ?? DEFAULT_TZ;

  if (!clientId || !clientSecret) {
    return { error: "Xero is not configured (set XERO_CLIENT_ID and XERO_CLIENT_SECRET)." };
  }

  const xero = new XeroClient({
    clientId,
    clientSecret,
    grantType: "client_credentials",
    scopes: ["accounting.transactions.read", "accounting.reports.read"],
  });

  try {
    await xero.getClientCredentialsToken();

    let tenantId = process.env.XERO_TENANT_ID?.trim() ?? "";
    if (!tenantId) {
      const tenants = await xero.updateTenants(false);
      tenantId = String(tenants[0]?.tenantId ?? "");
    }
    if (!tenantId) {
      return {
        error:
          "No Xero tenant found. Authorise this app’s Custom Connection in Xero, or set XERO_TENANT_ID in your environment.",
      };
    }

    const now = new Date();
    const { y: cy, m: cm } = zonedYMD(now, tz);

    const { cashMtdPeriodLabel, cashQtdPeriodLabel, cashFyPeriodLabel } = buildCashPeriodLabels(cy, cm);

    const MONTHS_CHART = 24;

    /** Four P&amp;L calls (two windows × cash + accrual); each call returns the anchor month + 11 prior months. */
    const { cash: cashByMonth, accrual: accrualByMonth } = await fetchPnlMonthlyMaps(xero, tenantId, cy, cm);

    const cashHero = derivePnlHeroFromMonthlyMap(cashByMonth, cy, cm);
    const accrualHero = derivePnlHeroFromMonthlyMap(accrualByMonth, cy, cm);

    const arWhere = `Type=="ACCREC"&&AmountDue>0`;
    const arInvoices = await paginateInvoices(xero, tenantId, arWhere);
    let outstandingAr = 0;
    for (const inv of arInvoices) {
      const due = inv.amountDue ?? 0;
      if (due > 0) outstandingAr += due;
    }

    const monthly: XeroSuccess["revenueCashByMonth"] = [];
    for (let i = 0; i < MONTHS_CHART; i++) {
      const { y, m } = addCalendarMonths(cy, cm, i - (MONTHS_CHART - 1));
      const key = `${y}-${String(m).padStart(2, "0")}`;
      monthly.push({
        month: key,
        label: monthLabel(y, m),
        invoicedRevenue: 0,
        cashCollected: 0,
        gap: 0,
      });
    }

    for (const row of monthly) {
      row.cashCollected = cashByMonth.get(row.month) ?? 0;
      row.invoicedRevenue = accrualByMonth.get(row.month) ?? 0;
      row.gap = row.invoicedRevenue - row.cashCollected;
    }

    return {
      cashCollectedMtd: cashHero.mtd,
      cashMtdPeriodLabel,
      cashCollectedQtd: cashHero.qtd,
      cashQtdPeriodLabel,
      cashCollectedQtdPriorComparable: cashHero.priorQtd,
      cashCollectedFyYtd: cashHero.fyYtd,
      cashFyPeriodLabel,
      cashCollectedFyYtdPriorComparable: cashHero.priorFyYtd,
      cashCollectedPriorMonthToDate: cashHero.priorMtd,
      cashDeltaVsPriorMonth: cashHero.mtd - cashHero.priorMtd,
      invoicedRevenueMtd: accrualHero.mtd,
      invoicedRevenueQtd: accrualHero.qtd,
      invoicedRevenueFyYtd: accrualHero.fyYtd,
      invoicedPriorMonthToDate: accrualHero.priorMtd,
      invoicedQtdPriorComparable: accrualHero.priorQtd,
      invoicedFyYtdPriorComparable: accrualHero.priorFyYtd,
      invoicedDeltaVsPriorMonth: accrualHero.mtd - accrualHero.priorMtd,
      outstandingAr,
      revenueCashByMonth: monthly,
    };
  } catch (e: unknown) {
    return { error: formatXeroCatch(e) };
  }
}
