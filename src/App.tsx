import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardStats } from "./types";
import "./App.css";

function aud(n: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString("en-AU", {
    month: "short",
    year: "2-digit",
  });
}

export default function App() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stats");
      const json = (await res.json()) as DashboardStats & { error?: string };
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        setData(null);
        return;
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <div className="shell">
      <header className="top">
        <div>
          <h1>Webhouse OS</h1>
          <p className="sub">Notion snapshot</p>
        </div>
        <div className="top-actions">
          <button type="button" className="btn" onClick={() => void load()}>
            Refresh
          </button>
          {data && (
            <span className="meta">
              Updated{" "}
              {new Date(data.generatedAt).toLocaleString("en-AU", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
          )}
        </div>
      </header>

      {loading && !data && <p className="hint">Loading…</p>}
      {error && (
        <div className="err" role="alert">
          {error}
        </div>
      )}

      {data && (
        <>
          <section className="grid kpis">
            <article className="card">
              <h2>Current leads</h2>
              <p className="kpi">{data.currentLeads}</p>
              <p className="fine">
                Companies with status Lead in Notion right now.
              </p>
            </article>
            <article className="card">
              <h2>MRR (ongoing)</h2>
              <p className="kpi">{aud(data.mrr)}</p>
              <p className="fine">Sum of MRR on projects with status Ongoing.</p>
            </article>
            <article className="card">
              <h2>Sales (Won) — last 30 days</h2>
              <p className="kpi">{aud(data.sales.last30Days)}</p>
            </article>
            <article className="card">
              <h2>Sales — quarter to date</h2>
              <p className="kpi">{aud(data.sales.quarterToDate)}</p>
              <p className="fine">Calendar quarter (Jan–Mar, Apr–Jun, …).</p>
            </article>
            <article className="card">
              <h2>Sales — year to date</h2>
              <p className="kpi">{aud(data.sales.yearToDate)}</p>
            </article>
            <article className="card">
              <h2>Sales — all time (Won)</h2>
              <p className="kpi">{aud(data.sales.allTime)}</p>
            </article>
          </section>

          <section className="card chart-card">
            <h2>New companies (CRM adds)</h2>
            <p className="fine">
              Count of company pages created per month (last 24 months). Use as
              a proxy for pipeline intake; add a “became lead” date in Notion
              later for stricter lead velocity.
            </p>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.companiesCreatedByMonth}>
                  <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={formatMonthLabel}
                    stroke="var(--muted)"
                    tick={{ fill: "var(--muted)", fontSize: 11 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    stroke="var(--muted)"
                    tick={{ fill: "var(--muted)", fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                    labelFormatter={(v) => String(v)}
                    formatter={(value) => [value ?? 0, "Companies"]}
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--accent)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card">
            <h2>
              Active projects{" "}
              <span className="badge">{data.activeProjects.count}</span>
            </h2>
            <p className="fine">
              Status is Planning, Active, or Ongoing (matches delivery in
              flight + recurring).
            </p>
            <ul className="proj-list">
              {data.activeProjects.projects.map((p) => (
                <li key={p.id}>
                  <span className="proj-name">{p.name}</span>
                  <span className="proj-meta">
                    {p.status}
                    {p.type ? ` · ${p.type}` : ""}
                    {p.mrr != null && p.mrr > 0
                      ? ` · ${aud(p.mrr)}/mo`
                      : p.totalValue != null && p.totalValue > 0
                        ? ` · ${aud(p.totalValue)}`
                        : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <footer className="fine foot">
            Won deal timing uses Expected Close Date when set; otherwise last
            edited time on the opportunity. Add a dedicated “Closed / Won date”
            in Notion for accounting-grade reporting.
          </footer>
        </>
      )}
    </div>
  );
}
