export type CashGoals = {
  monthly: number | null;
  quarterly: number | null;
  yearly: number | null;
};

export const EMPTY_CASH_GOALS: CashGoals = {
  monthly: null,
  quarterly: null,
  yearly: null,
};

export const CASH_GOALS_STORAGE_KEY = "webhouse-stats:cash-goals";

function numOrNull(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return v;
}

export function parseCashGoals(raw: string | null): CashGoals {
  if (!raw) return { ...EMPTY_CASH_GOALS };
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    return {
      monthly: numOrNull(p.monthly),
      quarterly: numOrNull(p.quarterly),
      yearly: numOrNull(p.yearly),
    };
  } catch {
    return { ...EMPTY_CASH_GOALS };
  }
}

export function serializeCashGoals(g: CashGoals): string {
  return JSON.stringify(g);
}

/** Normalise API / JSON body into validated goals (same rules as parseCashGoals). */
export function normalizeCashGoalsInput(input: unknown): CashGoals {
  if (!input || typeof input !== "object") return { ...EMPTY_CASH_GOALS };
  const o = input as Record<string, unknown>;
  return {
    monthly: numOrNull(o.monthly),
    quarterly: numOrNull(o.quarterly),
    yearly: numOrNull(o.yearly),
  };
}

export function hasAnyCashGoal(g: CashGoals): boolean {
  return g.monthly != null || g.quarterly != null || g.yearly != null;
}
