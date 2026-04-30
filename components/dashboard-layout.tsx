"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HelpTip } from "@/components/ui/help-tip";
import { useCashGoals } from "@/hooks/use-cash-goals";
import type { CashGoals } from "@/lib/cash-goals";
import type { DashboardStats, XeroStatsBlock, XeroStatsSuccess } from "@/lib/types";
import { cn } from "@/lib/utils";

function isXeroSuccess(x: XeroStatsBlock): x is XeroStatsSuccess {
  return "cashCollectedMtd" in x;
}

const xeroRevCashChartConfig = {
  invoicedRevenue: {
    label: "Invoiced",
    color: "rgba(184, 255, 87, 0.38)",
  },
  cashCollected: {
    label: "Cash",
    color: "#b8ff57",
  },
} satisfies ChartConfig;

type XeroRevCashSeries = keyof typeof xeroRevCashChartConfig;
type RevCashBreakdown = "monthly" | "quarterly";

type RevCashRow = {
  month: string;
  label: string;
  invoicedRevenue: number;
  cashCollected: number;
  gap: number;
};

function monthToFiscalQuarter(monthKey: string): { quarter: 1 | 2 | 3 | 4; fyStartYear: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  const quarter = (month >= 7 ? Math.floor((month - 7) / 3) : Math.floor((month + 5) / 3)) + 1;
  const fyStartYear = month >= 7 ? year : year - 1;
  return { quarter: quarter as 1 | 2 | 3 | 4, fyStartYear };
}

function fiscalQuarterLabel(fyStartYear: number, quarter: 1 | 2 | 3 | 4): string {
  const fyShort = String(fyStartYear + 1).slice(-2);
  return `FY${fyShort} Q${quarter}`;
}

function aud(n: number, compact = false): string {
  if (compact) {
    if (n >= 1_000_000)
      return (
        "$" +
        (n / 1_000_000).toLocaleString("en-AU", { maximumFractionDigits: 2 }) +
        "M"
      );
    if (n >= 1_000)
      return (
        "$" +
        (n / 1_000).toLocaleString("en-AU", { maximumFractionDigits: 1 }) +
        "K"
      );
  }
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/** % change MTD vs same calendar span last month; prior-period cash = 0 → no meaningful ratio. */
function pctChangeVsPriorMonth(mtd: number, prior: number): string {
  if (prior === 0) return mtd === 0 ? "0.0%" : "—";
  const pct = ((mtd - prior) / prior) * 100;
  const sign = pct >= 0 ? "+" : "−";
  return (
    sign +
    Math.abs(pct).toLocaleString("en-AU", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    }) +
    "%"
  );
}

function cashPctChangeClass(mtd: number, prior: number): string {
  if (prior === 0) return "text-[rgba(245,245,243,0.45)]";
  const delta = mtd - prior;
  if (delta > 0) return "text-[#b8ff57]/90";
  if (delta < 0) return "text-[#ff5757]/90";
  return "text-[rgba(245,245,243,0.45)]";
}

function CashGoalBar({ current, goal }: { current: number; goal: number | null }) {
  if (goal == null || goal <= 0) return null;
  const pctRaw = (current / goal) * 100;
  const barW = Math.min(100, Math.max(0, pctRaw));
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-semibold tabular-nums text-[#b8ff57]">
          {pctRaw.toLocaleString("en-AU", { maximumFractionDigits: 0 })}% of goal
        </span>
        <span className="tabular-nums text-[rgba(245,245,243,0.5)]">
          {aud(current, true)} / {aud(goal, true)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
        <div
          className="h-full rounded-full bg-[#b8ff57]/60 transition-[width] duration-300"
          style={{ width: `${barW}%` }}
        />
      </div>
    </div>
  );
}

function PnlCashGoalsDialog({
  goals,
  onSave,
}: {
  goals: CashGoals;
  onSave: (g: CashGoals) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CashGoals>(goals);

  useEffect(() => {
    if (open) setDraft(goals);
  }, [open, goals]);

  const patch = (key: keyof CashGoals, raw: string) => {
    if (raw.trim() === "") {
      setDraft((d) => ({ ...d, [key]: null }));
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return;
    setDraft((d) => ({ ...d, [key]: n === 0 ? null : n }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="shrink-0 text-[rgba(245,245,243,0.45)] hover:text-[rgba(245,245,243,0.85)]"
        aria-label="Cash collection goals"
        onClick={() => setOpen(true)}
      >
        <Settings2 className="size-3.5" />
      </Button>
      <DialogContent
        showCloseButton
        className="gap-3 border-[rgba(255,255,255,0.1)] bg-[#121216] text-foreground sm:max-w-sm"
      >
        <DialogHeader>
          <DialogTitle className="text-foreground">Cash goals</DialogTitle>
          <DialogDescription className="text-[rgba(245,245,243,0.55)]">
            Targets for payments-only (cash) Total Income. Leave blank to hide the goal bar.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm font-medium text-[rgba(245,245,243,0.55)]">
            Monthly
            <input
              type="number"
              min={0}
              step={1000}
              placeholder="AUD"
              value={draft.monthly ?? ""}
              onChange={(e) => patch("monthly", e.target.value)}
              className="rounded-md border border-[rgba(255,255,255,0.12)] bg-[#1a1a1f] px-2.5 py-1.5 text-base text-foreground outline-none placeholder:text-[rgba(245,245,243,0.3)] focus-visible:ring-2 focus-visible:ring-[rgba(184,255,87,0.25)]"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-[rgba(245,245,243,0.55)]">
            Quarterly
            <input
              type="number"
              min={0}
              step={1000}
              placeholder="AUD"
              value={draft.quarterly ?? ""}
              onChange={(e) => patch("quarterly", e.target.value)}
              className="rounded-md border border-[rgba(255,255,255,0.12)] bg-[#1a1a1f] px-2.5 py-1.5 text-base text-foreground outline-none placeholder:text-[rgba(245,245,243,0.3)] focus-visible:ring-2 focus-visible:ring-[rgba(184,255,87,0.25)]"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-[rgba(245,245,243,0.55)]">
            Yearly (FY)
            <input
              type="number"
              min={0}
              step={1000}
              placeholder="AUD"
              value={draft.yearly ?? ""}
              onChange={(e) => patch("yearly", e.target.value)}
              className="rounded-md border border-[rgba(255,255,255,0.12)] bg-[#1a1a1f] px-2.5 py-1.5 text-base text-foreground outline-none placeholder:text-[rgba(245,245,243,0.3)] focus-visible:ring-2 focus-visible:ring-[rgba(184,255,87,0.25)]"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-[#b8ff57] text-[#0a0a0c] hover:bg-[#b8ff57]/90"
            onClick={() => {
              onSave(draft);
              setOpen(false);
            }}
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function XeroPnlHeroCard({ xero }: { xero: XeroStatsSuccess }) {
  const [basis, setBasis] = useState<"cash" | "accrual">("cash");
  const { goals, setGoals } = useCashGoals();

  const mtd =
    basis === "cash"
      ? { cur: xero.cashCollectedMtd, prior: xero.cashCollectedPriorMonthToDate }
      : { cur: xero.invoicedRevenueMtd, prior: xero.invoicedPriorMonthToDate };
  const qtd =
    basis === "cash"
      ? { cur: xero.cashCollectedQtd, prior: xero.cashCollectedQtdPriorComparable }
      : { cur: xero.invoicedRevenueQtd, prior: xero.invoicedQtdPriorComparable };
  const fy =
    basis === "cash"
      ? { cur: xero.cashCollectedFyYtd, prior: xero.cashCollectedFyYtdPriorComparable }
      : { cur: xero.invoicedRevenueFyYtd, prior: xero.invoicedFyYtdPriorComparable };
  const hasAnyBankBalance =
    xero.bankBalances.transaction != null ||
    xero.bankBalances.savings != null ||
    xero.bankBalances.amexOwing != null;

  return (
    <div className="flex flex-col rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#121216] px-4 py-4 md:col-span-1">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="text-base font-semibold uppercase tracking-[0.12em] text-[rgba(245,245,243,0.72)]">
              Revenue
            </p>
            <HelpTip label="Revenue">
              <p>
                Numbers come from Xero&apos;s <strong className="text-foreground">Profit and Loss</strong> report,{" "}
                <strong className="text-foreground">Total Income</strong>. Use the toggle for{" "}
                <strong className="text-foreground">payments only</strong> (cash) vs <strong className="text-foreground">accrual</strong>.
              </p>
              <p className="mt-2">
                <strong className="text-foreground">MTD</strong> — calendar month to date.{" "}
                <strong className="text-foreground">QTD</strong> — current Australian fiscal quarter.{" "}
                <strong className="text-foreground">YTD</strong> — Australian FY (1 Jul–30 Jun) to date.
              </p>
              <p className="mt-2">
                <strong className="text-foreground">%</strong> comparisons use monthly P&amp;L columns: MTD vs{" "}
                <strong className="text-foreground">last month&apos;s</strong> column; QTD vs the{" "}
                <strong className="text-foreground">full previous fiscal quarter</strong> (three months); YTD vs the{" "}
                <strong className="text-foreground">same number of months</strong> in the prior FY (from last July).
              </p>
              <p className="mt-2">
                Use the <strong className="text-foreground">settings</strong> control to set monthly, quarterly, and FY
                cash goals (stored in this browser).
              </p>
              <p className="mt-2">
                Goals apply to cash (payments-only) only. The toggle switches Total Income between cash and accrual;
                the chart still shows both series.
              </p>
            </HelpTip>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <PnlCashGoalsDialog goals={goals} onSave={setGoals} />
            <div
            className="flex shrink-0 rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.25)] p-0.5"
            role="group"
            aria-label="P&L basis"
          >
            <button
              type="button"
              aria-pressed={basis === "cash"}
              onClick={() => setBasis("cash")}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm font-semibold uppercase tracking-[0.08em] transition-colors",
                basis === "cash"
                  ? "bg-[rgba(184,255,87,0.18)] text-[#b8ff57]"
                  : "text-[rgba(245,245,243,0.45)] hover:text-[rgba(245,245,243,0.72)]"
              )}
            >
              Cash
            </button>
            <button
              type="button"
              aria-pressed={basis === "accrual"}
              onClick={() => setBasis("accrual")}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm font-semibold uppercase tracking-[0.08em] transition-colors",
                basis === "accrual"
                  ? "bg-[rgba(184,255,87,0.18)] text-[#b8ff57]"
                  : "text-[rgba(245,245,243,0.45)] hover:text-[rgba(245,245,243,0.72)]"
              )}
            >
              Accrual
            </button>
          </div>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="text-sm font-semibold uppercase tracking-[0.1em] text-[rgba(245,245,243,0.5)]">MTD</p>
              <p className="text-sm font-medium tabular-nums text-[rgba(245,245,243,0.42)]">
                {xero.cashMtdPeriodLabel}
              </p>
            </div>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span
                style={{ letterSpacing: "-0.03em" }}
                className="text-[clamp(2rem,5vw,3.25rem)] font-black leading-none tabular-nums text-foreground"
              >
                {aud(mtd.cur, true)}
              </span>
              <span
                className={cn(
                  "text-[clamp(1rem,2.5vw,1.5rem)] font-bold tabular-nums",
                  cashPctChangeClass(mtd.cur, mtd.prior)
                )}
              >
                {pctChangeVsPriorMonth(mtd.cur, mtd.prior)}
              </span>
            </div>
            {basis === "cash" && <CashGoalBar current={xero.cashCollectedMtd} goal={goals.monthly} />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="text-sm font-semibold uppercase tracking-[0.1em] text-[rgba(245,245,243,0.5)]">QTD</p>
              <p className="text-sm font-medium tabular-nums text-[rgba(245,245,243,0.42)]">
                {xero.cashQtdPeriodLabel}
              </p>
            </div>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span
                style={{ letterSpacing: "-0.03em" }}
                className="text-[clamp(2rem,5vw,3.25rem)] font-black leading-none tabular-nums text-foreground"
              >
                {aud(qtd.cur, true)}
              </span>
              <span
                className={cn(
                  "text-[clamp(1rem,2.5vw,1.5rem)] font-bold tabular-nums",
                  cashPctChangeClass(qtd.cur, qtd.prior)
                )}
              >
                {pctChangeVsPriorMonth(qtd.cur, qtd.prior)}
              </span>
            </div>
            {basis === "cash" && <CashGoalBar current={xero.cashCollectedQtd} goal={goals.quarterly} />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="text-sm font-semibold uppercase tracking-[0.1em] text-[rgba(245,245,243,0.5)]">YTD</p>
              <p className="text-sm font-medium tabular-nums text-[rgba(245,245,243,0.42)]">
                {xero.cashFyPeriodLabel}
              </p>
            </div>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span
                style={{ letterSpacing: "-0.03em" }}
                className="text-[clamp(2rem,5vw,3.25rem)] font-black leading-none tabular-nums text-foreground"
              >
                {aud(fy.cur, true)}
              </span>
              <span
                className={cn(
                  "text-[clamp(1rem,2.5vw,1.5rem)] font-bold tabular-nums",
                  cashPctChangeClass(fy.cur, fy.prior)
                )}
              >
                {pctChangeVsPriorMonth(fy.cur, fy.prior)}
              </span>
            </div>
            {basis === "cash" && <CashGoalBar current={xero.cashCollectedFyYtd} goal={goals.yearly} />}
          </div>
          {hasAnyBankBalance && (
            <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[rgba(245,245,243,0.52)]">
                Balance sheet ({fmtDate(xero.bankBalances.asAt)})
              </p>
              <div className="mt-2 grid grid-cols-1 gap-1.5 text-sm md:grid-cols-3">
                <p className="flex items-baseline justify-between gap-2 tabular-nums text-[rgba(245,245,243,0.72)]">
                  <span className="text-[rgba(245,245,243,0.5)]">Transaction</span>
                  <span>{xero.bankBalances.transaction == null ? "—" : aud(xero.bankBalances.transaction, true)}</span>
                </p>
                <p className="flex items-baseline justify-between gap-2 tabular-nums text-[rgba(245,245,243,0.72)]">
                  <span className="text-[rgba(245,245,243,0.5)]">Savings</span>
                  <span>{xero.bankBalances.savings == null ? "—" : aud(xero.bankBalances.savings, true)}</span>
                </p>
                <p className="flex items-baseline justify-between gap-2 tabular-nums text-[rgba(245,245,243,0.72)]">
                  <span className="text-[rgba(245,245,243,0.5)]">AMEX owing</span>
                  <span>{xero.bankBalances.amexOwing == null ? "—" : aud(xero.bankBalances.amexOwing, true)}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DashboardLayout({ data }: { data: DashboardStats }) {
  const h = data.hero;
  const a = data.activity;
  const [revCashWindow, setRevCashWindow] = useState<6 | 12 | 24>(6);
  const [revCashBreakdown, setRevCashBreakdown] = useState<RevCashBreakdown>("monthly");
  const [hiddenRevCashSeries, setHiddenRevCashSeries] = useState<XeroRevCashSeries[]>([]);
  const toggleRevCashSeries = (key: string) => {
    setHiddenRevCashSeries((prev) =>
      prev.includes(key as XeroRevCashSeries)
        ? prev.filter((k) => k !== key)
        : [...prev, key as XeroRevCashSeries]
    );
  };
  const isRevCashHidden = (key: XeroRevCashSeries) => hiddenRevCashSeries.includes(key);
  const revCashChartData = useMemo<RevCashRow[]>(() => {
    if (!isXeroSuccess(data.xero)) return [];
    const monthlyRows = data.xero.revenueCashByMonth.slice(-revCashWindow);
    if (revCashBreakdown === "monthly") return monthlyRows;

    const byQuarter = new Map<
      string,
      { fyStartYear: number; quarter: 1 | 2 | 3 | 4; invoicedRevenue: number; cashCollected: number }
    >();
    for (const row of monthlyRows) {
      const q = monthToFiscalQuarter(row.month);
      if (!q) continue;
      const key = `${q.fyStartYear}-Q${q.quarter}`;
      const prev = byQuarter.get(key);
      if (prev) {
        prev.invoicedRevenue += row.invoicedRevenue;
        prev.cashCollected += row.cashCollected;
      } else {
        byQuarter.set(key, {
          fyStartYear: q.fyStartYear,
          quarter: q.quarter,
          invoicedRevenue: row.invoicedRevenue,
          cashCollected: row.cashCollected,
        });
      }
    }

    return [...byQuarter.values()].map((row) => ({
      month: `${row.fyStartYear}-Q${row.quarter}`,
      label: fiscalQuarterLabel(row.fyStartYear, row.quarter),
      invoicedRevenue: row.invoicedRevenue,
      cashCollected: row.cashCollected,
      gap: row.invoicedRevenue - row.cashCollected,
    }));
  }, [data.xero, revCashBreakdown, revCashWindow]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4">
      {data.todaysFocus && (
        <div className="flex shrink-0 items-center justify-center gap-2 text-center">
          <p className="text-sm font-medium text-[#b8ff57]/90 md:text-base">
            Today&apos;s focus — {data.todaysFocus}
          </p>
          <HelpTip label="What Today's focus means">
            <p>
              Auto-picked urgency: proposals sitting too long in stage, or accounts receivable
              that needs attention when your Notion fields support it.
            </p>
          </HelpTip>
        </div>
      )}

      <section
        aria-label="Xero cash and revenue"
        className="grid shrink-0 grid-cols-1 gap-4 md:grid-cols-3 md:gap-4"
      >
        {"disabled" in data.xero && data.xero.disabled ? (
          <>
            <div className="flex flex-col justify-between rounded-xl border border-dashed border-[rgba(255,255,255,0.18)] bg-[#121216] px-4 py-4 md:col-span-1">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold uppercase tracking-[0.12em] text-[rgba(245,245,243,0.72)]">
                    Revenue
                  </p>
                </div>
                <p
                  style={{ letterSpacing: "-0.03em" }}
                  className="mt-3 text-[clamp(1.25rem,3vw,1.75rem)] font-bold leading-snug text-[rgba(245,245,243,0.35)]"
                >
                  Not connected
                </p>
                <p className="mt-3 text-sm leading-snug text-[rgba(245,245,243,0.42)]">
                  Live P&amp;L figures load after you add Xero API credentials (including reports scope) for this app.
                </p>
              </div>
              <p className="mt-4 text-sm leading-snug text-[rgba(245,245,243,0.32)]">
                Add your Xero Custom Connection{" "}
                <span className="font-mono text-[rgba(245,245,243,0.5)]">XERO_CLIENT_ID</span> and{" "}
                <span className="font-mono text-[rgba(245,245,243,0.5)]">XERO_CLIENT_SECRET</span> to{" "}
                <span className="font-mono text-[rgba(245,245,243,0.5)]">.env.local</span> (see{" "}
                <span className="font-mono text-[rgba(245,245,243,0.5)]">.env.example</span>).
              </p>
            </div>
            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-[rgba(255,255,255,0.18)] bg-[#121216] px-6 py-8 text-center md:col-span-2">
              <p className="text-base font-bold uppercase tracking-[0.12em] text-[rgba(245,245,243,0.55)]">
                Invoiced vs cash (P&amp;L)
              </p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-[rgba(245,245,243,0.38)]">
                The bar and line chart (accrual vs payments-only P&amp;L Total Income by month) appears here once Xero
                is connected.
              </p>
            </div>
          </>
        ) : "error" in data.xero ? (
          <div className="md:col-span-3 rounded-xl border border-[#ff5757]/35 bg-[rgba(255,87,87,0.08)] px-4 py-3 text-sm text-[#ff5757]">
            Xero: {data.xero.error}
          </div>
        ) : isXeroSuccess(data.xero) ? (
          <>
            <XeroPnlHeroCard xero={data.xero} />

            <div className="flex min-h-[240px] flex-col rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#121216] px-4 py-4 md:col-span-2">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold uppercase tracking-[0.12em] text-[rgba(245,245,243,0.72)]">
                    Invoiced vs cash (P&amp;L)
                  </h2>
                  <HelpTip label="Invoiced vs cash (P&L)" iconClassName="size-3">
                    <p>
                      <strong className="text-foreground">Bars</strong> are{" "}
                      <strong className="text-foreground">accrual</strong> P&amp;L Total Income by month.{" "}
                      <strong className="text-foreground">Line</strong> is{" "}
                      <strong className="text-foreground">payments-only</strong> P&amp;L Total Income by month. The gap
                      is mostly timing (invoice vs cash).
                    </p>
                  </HelpTip>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div
                    className="flex shrink-0 rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.25)] p-0.5"
                    role="group"
                    aria-label="Chart breakdown"
                  >
                    <button
                      type="button"
                      aria-pressed={revCashBreakdown === "monthly"}
                      onClick={() => setRevCashBreakdown("monthly")}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-sm font-semibold uppercase tracking-[0.08em] transition-colors",
                        revCashBreakdown === "monthly"
                          ? "bg-[rgba(184,255,87,0.18)] text-[#b8ff57]"
                          : "text-[rgba(245,245,243,0.45)] hover:text-[rgba(245,245,243,0.72)]"
                      )}
                    >
                      Monthly
                    </button>
                    <button
                      type="button"
                      aria-pressed={revCashBreakdown === "quarterly"}
                      onClick={() => setRevCashBreakdown("quarterly")}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-sm font-semibold uppercase tracking-[0.08em] transition-colors",
                        revCashBreakdown === "quarterly"
                          ? "bg-[rgba(184,255,87,0.18)] text-[#b8ff57]"
                          : "text-[rgba(245,245,243,0.45)] hover:text-[rgba(245,245,243,0.72)]"
                      )}
                    >
                      Quarterly
                    </button>
                  </div>
                  <label className="flex shrink-0 items-center gap-2 text-sm text-[rgba(245,245,243,0.5)]">
                    <span className="sr-only">Chart period</span>
                    <select
                      value={revCashWindow}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (v === 6 || v === 12 || v === 24) setRevCashWindow(v);
                      }}
                      className="cursor-pointer rounded-md border border-[rgba(255,255,255,0.14)] bg-[#1a1a1f] px-2.5 py-1.5 text-sm font-semibold text-[rgba(245,245,243,0.88)] outline-none hover:border-[rgba(255,255,255,0.22)] focus-visible:ring-2 focus-visible:ring-[rgba(184,255,87,0.25)]"
                      aria-label="Chart time period"
                    >
                      <option value={6}>Last 6 months</option>
                      <option value={12}>Last 12 months</option>
                      <option value={24}>Last 24 months</option>
                    </select>
                  </label>
                </div>
              </div>
              <ChartContainer
                id="xero-rev-cash"
                config={xeroRevCashChartConfig}
                initialDimension={{ width: 640, height: 220 }}
                className="aspect-auto min-h-0 w-full flex-1 !aspect-auto [&_.recharts-legend-item-text]:text-[rgba(245,245,243,0.72)]"
              >
                <ComposedChart
                  data={revCashChartData}
                  margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    angle={revCashBreakdown === "monthly" && revCashWindow >= 12 ? -38 : 0}
                    textAnchor={revCashBreakdown === "monthly" && revCashWindow >= 12 ? "end" : "middle"}
                    height={revCashBreakdown === "monthly" && revCashWindow >= 12 ? 54 : 30}
                    interval={0}
                    tick={{
                      fill: "rgba(245,245,243,0.55)",
                      fontSize:
                        revCashBreakdown === "monthly"
                          ? revCashWindow >= 24
                            ? 9
                            : revCashWindow > 6
                              ? 10
                              : 11
                          : 11,
                    }}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                  />
                  <YAxis
                    tickFormatter={(v: number) => aud(v, true)}
                    width={52}
                    tick={{ fill: "rgba(245,245,243,0.45)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                  />
                  <ChartTooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    content={
                      <ChartTooltipContent
                        className="border-white/10 bg-[#1a1a1f]"
                        formatter={(value, name) => (
                          <div className="flex w-full min-w-[180px] justify-between gap-4">
                            <span className="text-muted-foreground">{name}</span>
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {typeof value === "number" ? aud(value, true) : "—"}
                            </span>
                          </div>
                        )}
                      />
                    }
                  />
                  <ChartLegend
                    content={
                      <ChartLegendContent
                        className="pt-2"
                        onItemClick={toggleRevCashSeries}
                        hiddenKeys={hiddenRevCashSeries}
                      />
                    }
                  />
                  <Bar
                    dataKey="invoicedRevenue"
                    fill="var(--color-invoicedRevenue)"
                    radius={[4, 4, 0, 0]}
                    hide={isRevCashHidden("invoicedRevenue")}
                    activeBar={{
                      fill: "var(--color-invoicedRevenue)",
                      stroke: "#b8ff57",
                      strokeWidth: 2,
                      style: { filter: "drop-shadow(0 0 10px rgba(184,255,87,0.55))" },
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cashCollected"
                    stroke="var(--color-cashCollected)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "var(--color-cashCollected)" }}
                    activeDot={{
                      r: 6,
                      fill: "var(--color-cashCollected)",
                      stroke: "#0a0a0c",
                      strokeWidth: 2,
                    }}
                    hide={isRevCashHidden("cashCollected")}
                  />
                </ComposedChart>
              </ChartContainer>
            </div>
          </>
        ) : null}
      </section>

      {/* Zone 1 — Hero */}
      <section
        aria-label="Key metrics"
        className="grid shrink-0 grid-cols-2 gap-4 md:grid-cols-4 md:gap-4"
      >
        <HeroStat
          label="Receivables"
          helpTitle="Receivables (Xero AR)"
          help={
            <>
              <p>
                Total <strong className="text-foreground">AmountDue</strong> across authorised
                Accounts Receivable (<strong className="text-foreground">ACCREC</strong>) invoices
                in Xero. Reflects what customers currently owe, regardless of due date. The subline
                counts those invoices.
              </p>
            </>
          }
          value={isXeroSuccess(data.xero) ? aud(data.xero.outstandingAr, true) : "—"}
          subline={
            isXeroSuccess(data.xero)
              ? `${data.xero.outstandingArCount} invoice${data.xero.outstandingArCount === 1 ? "" : "s"}`
              : "Xero not connected"
          }
        />
        <HeroStat
          label="Overdue"
          helpTitle="Overdue receivables"
          help={
            <>
              <p>
                Sum of <strong className="text-foreground">AmountDue</strong> on Xero AR invoices
                whose <strong className="text-foreground">due date</strong> has already passed
                (reporting timezone). Chase these first.
              </p>
            </>
          }
          value={isXeroSuccess(data.xero) ? aud(data.xero.overdueAr, true) : "—"}
          valueClassName={
            isXeroSuccess(data.xero) && data.xero.overdueAr > 0
              ? "text-[#ff5757] drop-shadow-[0_0_24px_rgba(255,87,87,0.18)]"
              : ""
          }
          subline={
            isXeroSuccess(data.xero)
              ? `${data.xero.overdueArCount} invoice${data.xero.overdueArCount === 1 ? "" : "s"} past due`
              : "Xero not connected"
          }
        />
        <HeroStat
          label="MRR"
          helpTitle="MRR (monthly recurring revenue)"
          help={
            <>
              <p>
                Sums the <strong className="text-foreground">MRR</strong> field on every Notion project
                whose <strong className="text-foreground">Status</strong> is{" "}
                <strong className="text-foreground">Ongoing</strong> (retainers, hosting, and any other
                recurring work with MRR set). The subline counts those projects.
              </p>
            </>
          }
          value={aud(h.mrr, true)}
          valueClassName={
            h.mrrPositiveHighlight ? "text-[#b8ff57] drop-shadow-[0_0_24px_rgba(184,255,87,0.25)]" : ""
          }
          subline={`${h.mrrProjectCount} project${h.mrrProjectCount === 1 ? "" : "s"}`}
        />
        <HeroStat
          label="Open pipeline"
          helpTitle="Open pipeline"
          help={
            <>
              <p>
                Sum of <strong className="text-foreground">Value</strong> on opportunities that are
                not in a <strong className="text-foreground">closed</strong> stage (e.g. Won, Lost).
                The subline counts those deals.
              </p>
            </>
          }
          value={aud(h.pipelineValue, true)}
          subline={`${h.pipelineDealCount} deal${h.pipelineDealCount === 1 ? "" : "s"}`}
        />
      </section>

      {/* Zone 2 — Same grid as hero: md:grid-cols-4; left 2 cols = tiles + won/ar + proposals; right 2 cols = active */}
      <section
        aria-label="Lists"
        className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-4 md:grid-rows-[auto_auto_minmax(0,1fr)]"
      >
        <ActivityTile
          className="md:col-start-1 md:row-start-1"
          label="Proposals out"
          helpTitle="Proposals out"
          help={
            <p>
              Deals in stages that look like proposal, quote, sent, negotiation, or contract. Value
              is the sum of those opportunities&apos; <strong className="text-foreground">Value</strong>{" "}
              fields.
            </p>
          }
          value={`${a.proposalsOutCount} / ${aud(a.proposalsOutValue, true)}`}
        />
        <ActivityTile
          className="md:col-start-2 md:row-start-1"
          label="New opps 7d"
          helpTitle="New opps (7 days)"
          help={
            <p>
              Count of opportunities whose <strong className="text-foreground">created</strong> time
              is within the last 7 days.
            </p>
          }
          value={String(a.newOpps7d)}
        />
        <div className="grid shrink-0 grid-cols-2 gap-4 md:col-span-2 md:col-start-1 md:row-start-2">
          <ActivityTile
            label="Won MTD"
            helpTitle="Won month-to-date"
            help={
              <p>
                Opportunities in stage <strong className="text-foreground">Won</strong> whose win / close
                date falls in the current calendar month (see API for date rules).
              </p>
            }
            value={`${a.wonMtdCount} / ${aud(a.wonMtdValue, true)}`}
          />
          <ActivityTile
            label="AR outstanding"
            helpTitle="Accounts receivable outstanding"
            help={
              <>
                <p>
                  Sums optional AR fields on projects: <strong className="text-foreground">AR</strong>,{" "}
                  <strong className="text-foreground">Accounts Receivable</strong>,{" "}
                  <strong className="text-foreground">Balance Due</strong>, or{" "}
                  <strong className="text-foreground">Outstanding</strong>. Shows &mdash; if none are set.
                </p>
                <p className="mt-2 text-[#ff5757]">
                  Red tile when <strong>Days overdue</strong> or <strong>AR days overdue</strong> is over
                  30.
                </p>
              </>
            }
            value={a.arOutstanding != null ? aud(a.arOutstanding, true) : "—"}
            alert={a.arAlert}
          />
        </div>
        <div className="flex min-h-[200px] min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#121216] md:col-span-2 md:col-start-1 md:row-start-3">
            <div className="flex shrink-0 items-center gap-1.5 px-4 py-3">
              <h2 className="text-base font-bold uppercase tracking-[0.12em] text-[rgba(245,245,243,0.72)]">
                Proposals out
              </h2>
              <HelpTip label="Proposals out table" iconClassName="size-3">
                <p>
                  Same filter as the activity tile: open deals in proposal-like stages. Chase these
                  first. Rows go red when <strong className="text-[#ff5757]">stage age</strong> exceeds 10
                  days (see column help).
                </p>
              </HelpTip>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full border-collapse text-left text-base">
              <thead className="sticky top-0 z-[1] bg-[#121216] text-sm font-semibold uppercase tracking-[0.06em] text-[rgba(245,245,243,0.62)]">
                <tr>
                  <th className="px-4 py-2 font-semibold">Company</th>
                  <th className="px-2 py-2 font-semibold">Value</th>
                  <th className="px-2 py-2 font-semibold">
                    <span className="inline-flex items-center gap-1">
                      Stage age
                      <HelpTip label="Stage age" iconClassName="size-3">
                        <p>
                          Days since this opportunity was last edited in Notion — a proxy for time in
                          the current stage until you add a dedicated &quot;proposal sent&quot; date.
                        </p>
                      </HelpTip>
                    </span>
                  </th>
                  <th className="px-4 py-2 font-semibold">
                    <span className="inline-flex items-center gap-1">
                      Expected close
                      <HelpTip label="Expected close" iconClassName="size-3">
                        <p>
                          From the <strong className="text-foreground">Expected Close Date</strong>{" "}
                          property on the deal.
                        </p>
                      </HelpTip>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.proposalsOut.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[rgba(245,245,243,0.35)]">
                      No proposals in flight
                    </td>
                  </tr>
                ) : (
                  data.proposalsOut.map((row, i) => (
                    <tr
                      key={i}
                      className={
                        row.stageAgeAlert
                          ? "bg-[rgba(255,87,87,0.06)] text-foreground"
                          : "border-t border-[rgba(255,255,255,0.05)]"
                      }
                    >
                      <td className="max-w-[140px] truncate px-4 py-2.5 font-medium">
                        {row.company}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 tabular-nums">
                        {aud(row.value, true)}
                      </td>
                      <td
                        className={
                          row.stageAgeAlert
                            ? "whitespace-nowrap px-2 py-2.5 font-semibold text-[#ff5757]"
                            : "whitespace-nowrap px-2 py-2.5 tabular-nums text-[rgba(245,245,243,0.85)]"
                        }
                      >
                        {row.stageAgeDays} days
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[rgba(245,245,243,0.75)]">
                        {fmtDate(row.expectedClose)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </div>

        <div className="flex min-h-[200px] min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#121216] md:col-span-2 md:col-start-3 md:row-start-1 md:row-span-3 md:min-h-0">
          <div className="flex shrink-0 items-center gap-1.5 px-4 py-3">
            <h2 className="text-base font-bold uppercase tracking-[0.12em] text-[rgba(245,245,243,0.72)]">
              Active projects
            </h2>
            <HelpTip label="Active projects table" iconClassName="size-3">
              <p>
                Projects in <strong className="text-foreground">Planning</strong>,{" "}
                <strong className="text-foreground">Active</strong>,{" "}
                <strong className="text-foreground">Ongoing</strong>, or{" "}
                <strong className="text-foreground">Hosting</strong>. Grouped by{" "}
                <strong className="text-foreground">Engagement</strong>,{" "}
                <strong className="text-foreground">Project type</strong>, or{" "}
                <strong className="text-foreground">Type</strong> when set; otherwise{" "}
                <strong className="text-foreground">Ongoing</strong> status → Ongoing,{" "}
                <strong className="text-foreground">Hosting</strong> → Hosting, and{" "}
                <strong className="text-foreground">Planning</strong> /{" "}
                <strong className="text-foreground">Active</strong> → One-off.{" "}
                <strong className="text-foreground">Value</strong> uses MRR when it&apos;s greater
                than zero (shown with <strong className="text-foreground">/m</strong>); otherwise the
                first of Value, Total Value, Total value, Budget, Contract value, Project value,
                Quote, Amount, Fee, or Total. Group subtotals sum all projects in that group (not
                only the rows
                shown).
              </p>
            </HelpTip>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full border-collapse text-left text-base">
              <thead className="sticky top-0 z-[1] bg-[#121216] text-sm font-semibold uppercase tracking-[0.06em] text-[rgba(245,245,243,0.62)]">
                <tr>
                  <th className="px-4 py-2 font-semibold">Project</th>
                  <th className="px-2 py-2 font-semibold">Client</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 text-right font-semibold">Value</th>
                </tr>
              </thead>
              <tbody>
                {data.activeProjectGroups.every((g) => g.rows.length === 0) ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[rgba(245,245,243,0.35)]">
                      No active projects
                    </td>
                  </tr>
                ) : (
                  data.activeProjectGroups.map((g) =>
                    g.rows.length === 0 ? null : (
                      <Fragment key={g.id}>
                        <tr className="border-t border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]">
                          <td
                            colSpan={4}
                            className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[rgba(245,245,243,0.5)]"
                          >
                            {g.title}
                          </td>
                        </tr>
                        {g.rows.map((row, i) => (
                          <tr
                            key={`${g.id}-${i}`}
                            className="border-t border-[rgba(255,255,255,0.05)]"
                          >
                            <td className="max-w-[140px] truncate px-4 py-2.5 font-medium">
                              {row.project}
                            </td>
                            <td className="max-w-[120px] truncate px-2 py-2.5 text-[rgba(245,245,243,0.8)]">
                              {row.client}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2.5 text-[rgba(245,245,243,0.65)]">
                              {row.status ?? "—"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[rgba(245,245,243,0.85)]">
                              {aud(row.valueAud, true)}
                              {row.valueIsMrr ? (
                                <span className="text-[rgba(245,245,243,0.45)]">/m</span>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)]">
                          <td
                            colSpan={3}
                            className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-[0.06em] text-[rgba(245,245,243,0.42)]"
                          >
                            Subtotal
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-right text-base font-semibold tabular-nums text-[rgba(245,245,243,0.92)]">
                            {aud(g.totalValueAud, true)}
                          </td>
                        </tr>
                      </Fragment>
                    )
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function HeroStat({
  label,
  value,
  subline,
  valueClassName = "",
  help,
  helpTitle,
}: {
  label: string;
  value: string;
  subline: string;
  valueClassName?: string;
  help: ReactNode;
  helpTitle: string;
}) {
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#121216] px-4 py-4">
      <div className="flex items-center gap-1.5">
        <p className="text-base font-semibold uppercase tracking-[0.12em] text-[rgba(245,245,243,0.72)]">
          {label}
        </p>
        <HelpTip label={helpTitle}>{help}</HelpTip>
      </div>
      <p
        style={{ letterSpacing: "-0.03em" }}
        className={cn(
          "mt-2 text-[clamp(2rem,5vw,3.25rem)] font-black leading-none tabular-nums",
          valueClassName || "text-foreground"
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-base text-[rgba(245,245,243,0.42)]">{subline}</p>
    </div>
  );
}

function ActivityTile({
  label,
  value,
  alert,
  help,
  helpTitle,
  className,
}: {
  label: string;
  value: string;
  alert?: boolean;
  help: ReactNode;
  helpTitle: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#121216] px-4 py-4",
        alert && "border-[#ff5757]/40 bg-[rgba(255,87,87,0.08)]",
        className
      )}
    >
      <div className="flex items-center gap-1.5">
        <p className="text-base font-semibold uppercase tracking-[0.12em] text-[rgba(245,245,243,0.72)]">
          {label}
        </p>
        <HelpTip label={helpTitle}>{help}</HelpTip>
      </div>
      <p
        className={cn(
          "mt-2 text-[clamp(1.25rem,3vw,1.75rem)] font-black tabular-nums leading-none tracking-[-0.03em]",
          alert ? "text-[#ff5757]" : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}
