export interface VideoIdea {
  title: string;
  hook: string;
  format: string;
  talkingPoints: string[];
  shotList: string[];
  whyItWorks: string;
}

export interface ShootPlanData {
  title: string;
  summary: string;
  videoIdeas: VideoIdea[];
  generalTips: string[];
  equipmentSuggestions: string[];
}

export interface ShootItem {
  mondayItemId: string;
  clientName: string;
  abbreviation: string;
  groupTitle: string;
  date: string | null;
  rawsStatus: string;
  editingStatus: string;
  assignmentStatus: string;
  clientApproval: string;
  agency: string;
  boostingStatus: string;
  notes: string;
  rawsFolderUrl: string;
  editedVideosFolderUrl: string;
  laterCalendarUrl: string;
  columns: Record<string, string>;
  clientId: string | null;
  clientSlug: string | null;
  clientIndustry: string | null;
  clientLogoUrl: string | null;
  // Plan data (fetched from DB)
  planData?: ShootPlanData | null;
  planStatus?: string | null;
}
