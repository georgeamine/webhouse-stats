"use client";

import type { ReactNode } from "react";

import { HelpTip } from "@/components/ui/help-tip";
import type { DashboardStats } from "@/lib/types";

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

export function DashboardLayout({ data }: { data: DashboardStats }) {
  const h = data.hero;
  const a = data.activity;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-3 md:gap-5 md:py-4">
      {data.todaysFocus && (
        <div className="flex shrink-0 items-center justify-center gap-2 text-center">
          <p className="text-[12px] font-medium text-[#b8ff57]/90 md:text-[13px]">
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

      {/* Zone 1 — Hero */}
      <section
        aria-label="Key metrics"
        className="grid shrink-0 grid-cols-1 gap-6 border-b border-[rgba(255,255,255,0.08)] pb-5 md:grid-cols-3 md:gap-4 md:pb-6"
      >
        <HeroStat
          label="MRR"
          helpTitle="MRR (monthly recurring revenue)"
          help={
            <>
              <p>
                Sums the <strong className="text-foreground">MRR</strong> field on every Notion project
                whose <strong className="text-foreground">Status</strong> is{" "}
                <strong className="text-foreground">Ongoing</strong> (retainers, hosting, and any other
                recurring work with MRR set).
              </p>
            </>
          }
          value={aud(h.mrr, true)}
          valueClassName={
            h.mrrPositiveHighlight ? "text-[#b8ff57] drop-shadow-[0_0_24px_rgba(184,255,87,0.25)]" : ""
          }
          subline={h.mrrSubline}
        />
        <HeroStat
          label="Signed backlog"
          helpTitle="Signed backlog"
          help={
            <>
              <p>
                Total <strong className="text-foreground">Total Value</strong> across projects in{" "}
                <strong className="text-foreground">Planning</strong>,{" "}
                <strong className="text-foreground">Active</strong>, or{" "}
                <strong className="text-foreground">Ongoing</strong>. The subline is how many such
                projects.
              </p>
            </>
          }
          value={aud(h.signedBacklogValue, true)}
          subline={`${h.signedBacklogProjectCount} project${h.signedBacklogProjectCount === 1 ? "" : "s"}`}
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

      {/* Zone 2 — Activity */}
      <section
        aria-label="This week"
        className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-4 md:gap-4"
      >
        <ActivityTile
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
      </section>

      {/* Zone 3 — Tables */}
      <section
        aria-label="Lists"
        className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-2 lg:gap-6"
      >
        <div className="flex min-h-[200px] flex-col overflow-hidden rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#121216] lg:min-h-0">
          <div className="flex shrink-0 items-center gap-1.5 border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[rgba(245,245,243,0.72)]">
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
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="sticky top-0 z-[1] bg-[#121216] text-[11px] font-semibold uppercase tracking-[0.06em] text-[rgba(245,245,243,0.62)]">
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

        <div className="flex min-h-[200px] flex-col overflow-hidden rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#121216] lg:min-h-0">
          <div className="flex shrink-0 items-center gap-1.5 border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[rgba(245,245,243,0.72)]">
              Active projects
            </h2>
            <HelpTip label="Active projects table" iconClassName="size-3">
              <p>
                Projects in <strong className="text-foreground">Planning</strong>,{" "}
                <strong className="text-foreground">Active</strong>, or{" "}
                <strong className="text-foreground">Ongoing</strong>. Client comes from a company
                relation or text fields. End date tries <strong className="text-foreground">End Date</strong>
                , <strong className="text-foreground">Delivery Date</strong>, then{" "}
                <strong className="text-foreground">Due Date</strong>.
              </p>
            </HelpTip>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="sticky top-0 z-[1] bg-[#121216] text-[11px] font-semibold uppercase tracking-[0.06em] text-[rgba(245,245,243,0.62)]">
                <tr>
                  <th className="px-4 py-2 font-semibold">Project</th>
                  <th className="px-2 py-2 font-semibold">Client</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">End date</th>
                </tr>
              </thead>
              <tbody>
                {data.activeProjects.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[rgba(245,245,243,0.35)]">
                      No active projects
                    </td>
                  </tr>
                ) : (
                  data.activeProjects.map((row, i) => (
                    <tr
                      key={i}
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
                      <td className="whitespace-nowrap px-4 py-2.5 text-[rgba(245,245,243,0.75)]">
                        {fmtDate(row.endDate)}
                      </td>
                    </tr>
                  ))
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
    <div className="text-center md:text-left">
      <div className="flex items-center justify-center gap-1.5 md:justify-start">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[rgba(245,245,243,0.72)]">
          {label}
        </p>
        <HelpTip label={helpTitle}>{help}</HelpTip>
      </div>
      <p
        style={{ letterSpacing: "-0.03em" }}
        className={`mt-2 text-[clamp(2rem,5vw,3.25rem)] font-black leading-none tabular-nums text-foreground ${valueClassName}`}
      >
        {value}
      </p>
      <p className="mt-2 text-[13px] text-[rgba(245,245,243,0.42)]">{subline}</p>
    </div>
  );
}

function ActivityTile({
  label,
  value,
  alert,
  help,
  helpTitle,
}: {
  label: string;
  value: string;
  alert?: boolean;
  help: ReactNode;
  helpTitle: string;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-3 md:px-4 md:py-4 ${
        alert
          ? "border-[#ff5757]/40 bg-[rgba(255,87,87,0.08)]"
          : "border-[rgba(255,255,255,0.1)] bg-[#141414]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-[12px] font-bold uppercase tracking-[0.11em] text-[rgba(245,245,243,0.68)]">
          {label}
        </p>
        <HelpTip label={helpTitle} className="mt-0.5">
          {help}
        </HelpTip>
      </div>
      <p
        className={`mt-2 text-[clamp(1rem,2.5vw,1.35rem)] font-black tabular-nums leading-tight ${
          alert ? "text-[#ff5757]" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
