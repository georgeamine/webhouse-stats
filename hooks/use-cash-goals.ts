"use client";

import { useCallback, useEffect, useState } from "react";

import {
  CASH_GOALS_STORAGE_KEY,
  EMPTY_CASH_GOALS,
  type CashGoals,
  parseCashGoals,
  serializeCashGoals,
} from "@/lib/cash-goals";

export function useCashGoals() {
  const [goals, setGoalsState] = useState<CashGoals>(EMPTY_CASH_GOALS);

  useEffect(() => {
    setGoalsState(parseCashGoals(localStorage.getItem(CASH_GOALS_STORAGE_KEY)));
  }, []);

  const setGoals = useCallback((next: CashGoals) => {
    setGoalsState(next);
    try {
      localStorage.setItem(CASH_GOALS_STORAGE_KEY, serializeCashGoals(next));
    } catch {
      /* quota / private mode */
    }
  }, []);

  return { goals, setGoals };
}
