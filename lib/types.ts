/** Executive dashboard — one screen, three zones (API `/api/stats`). */
export type DashboardStats = {
  generatedAt: string;

  /** Optional one-line urgency above the hero row. */
  todaysFocus: string | null;

  hero: {
    mrr: number;
    /** e.g. "+$45k won MTD" — momentum proxy when true MoM MRR isn’t in Notion. */
    mrrSubline: string;
    /** Whether to show positive (green) styling on MRR (e.g. any won MTD). */
    mrrPositiveHighlight: boolean;

    signedBacklogValue: number;
    signedBacklogProjectCount: number;

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
