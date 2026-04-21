"use client";

import { useCallback, useEffect, useState } from "react";

import {
  CASH_GOALS_STORAGE_KEY,
  EMPTY_CASH_GOALS,
  type CashGoals,
  hasAnyCashGoal,
  normalizeCashGoalsInput,
  parseCashGoals,
  serializeCashGoals,
} from "@/lib/cash-goals";

async function fetchGoalsFromApi(): Promise<CashGoals | null> {
  const res = await fetch("/api/cash-goals", { cache: "no-store" });
  if (!res.ok) return null;
  return normalizeCashGoalsInput(await res.json());
}

export function useCashGoals() {
  const [goals, setGoalsState] = useState<CashGoals>(EMPTY_CASH_GOALS);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const fromApi = await fetchGoalsFromApi();
      if (cancelled) return;

      if (fromApi) {
        let next = fromApi;
        if (!hasAnyCashGoal(fromApi)) {
          const migrated = parseCashGoals(localStorage.getItem(CASH_GOALS_STORAGE_KEY));
          if (hasAnyCashGoal(migrated)) {
            try {
              const put = await fetch("/api/cash-goals", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: serializeCashGoals(migrated),
              });
              if (put.ok) {
                next = normalizeCashGoalsInput(await put.json());
                try {
                  localStorage.removeItem(CASH_GOALS_STORAGE_KEY);
                } catch {
                  /* ignore */
                }
              } else {
                next = migrated;
              }
            } catch {
              next = migrated;
            }
          }
        }
        setGoalsState(next);
        return;
      }

      setGoalsState(parseCashGoals(localStorage.getItem(CASH_GOALS_STORAGE_KEY)));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setGoals = useCallback((next: CashGoals) => {
    setGoalsState(next);
    void (async () => {
      try {
        const res = await fetch("/api/cash-goals", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: serializeCashGoals(next),
        });
        if (res.ok) {
          setGoalsState(normalizeCashGoalsInput(await res.json()));
          try {
            localStorage.removeItem(CASH_GOALS_STORAGE_KEY);
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* optimistic UI; reload may differ if save failed */
      }
    })();
  }, []);

  return { goals, setGoals };
}
