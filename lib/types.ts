/** Executive dashboard — one screen, three zones (API `/api/stats`). */
export type XeroStatsBlock =
  | { disabled: true }
  | {
      cashCollectedMtd: number;
      /** e.g. "April 2026" — calendar month for MTD (reporting TZ). */
      cashMtdPeriodLabel: string;
      cashCollectedQtd: number;
      /** e.g. "Q2 · Oct – Dec 2025" — current AU fiscal quarter. */
      cashQtdPeriodLabel: string;
      /** Cash collected FYTD — Australian financial year (Jul 1–Jun 30). */
      cashCollectedFyYtd: number;
      /** e.g. "FY 2025–26" — AU financial year label. */
      cashFyPeriodLabel: string;
      cashCollectedPriorMonthToDate: number;
      /** Same elapsed time in the previous fiscal quarter (for QTD %). */
      cashCollectedQtdPriorComparable: number;
      /** Same elapsed time in the previous financial year (for YTD %). */
      cashCollectedFyYtdPriorComparable: number;
      cashDeltaVsPriorMonth: number;
      /** P&L Total Income, accrual basis (same windows as cash). */
      invoicedRevenueMtd: number;
      invoicedRevenueQtd: number;
      invoicedRevenueFyYtd: number;
      invoicedPriorMonthToDate: number;
      invoicedQtdPriorComparable: number;
      invoicedFyYtdPriorComparable: number;
      invoicedDeltaVsPriorMonth: number;
      outstandingAr: number;
      /** Sum of AmountDue on ACCREC invoices whose due date is before today (reporting TZ). */
      overdueAr: number;
      /** Count of ACCREC invoices whose due date is before today. */
      overdueArCount: number;
      /** Rolling 24 calendar months (oldest → newest); Xero returns 12 monthly columns per request (base + 11 comparisons), merged twice for coverage. UI: last 6 / 12 / 24. */
      revenueCashByMonth: {
        month: string;
        label: string;
        invoicedRevenue: number;
        cashCollected: number;
        gap: number;
      }[];
    }
  | { error: string };

/** Live Xero metrics (not disabled, not error). */
export type XeroStatsSuccess = Extract<XeroStatsBlock, { cashCollectedMtd: number }>;

export type DashboardStats = {
  generatedAt: string;

  /** Optional one-line urgency above the hero row. */
  todaysFocus: string | null;

  /** Xero Accounting: live data, API error, or disabled until env is set. */
  xero: XeroStatsBlock;

  hero: {
    mrr: number;
    /** e.g. "+$45k won MTD" — momentum proxy when true MoM MRR isn’t in Notion. */
    mrrSubline: string;
    /** Whether to show positive (green) styling on MRR (e.g. any won MTD). */
    mrrPositiveHighlight: boolean;

    pipelineValue: number;
    pipelineDealCount: number;
  };

  activity: {
    proposalsOutCount: number;
    proposalsOutValue: number;
    newOpps7d: number;
    wonMtdCount: number;
    wonMtdValue: number;
    /** Sum from projects if an AR / balance field exists; null if not configured. */
    arOutstanding: number | null;
    /** True when AR field exists and days-overdue over 30 (if that field exists). */
    arAlert: boolean;
  };

  proposalsOut: {
    company: string;
    value: number;
    /** Days in current stage (uses last edit as proxy if no stage-entered date). */
    stageAgeDays: number;
    stageAgeAlert: boolean;
    expectedClose: string | null;
  }[];

  activeProjects: {
    project: string;
    client: string;
    status: string | null;
    endDate: string | null;
  }[];
};
