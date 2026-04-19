export type DashboardStats = {
  generatedAt: string;
  currentLeads: number;
  companiesCreatedByMonth: { month: string; count: number }[];
  mrr: number;
  sales: {
    last30Days: number;
    quarterToDate: number;
    yearToDate: number;
    allTime: number;
  };
  activeProjects: {
    count: number;
    projects: {
      id: string;
      name: string;
      status: string | null;
      type: string | null;
      mrr: number | null;
      totalValue: number | null;
    }[];
  };
};
