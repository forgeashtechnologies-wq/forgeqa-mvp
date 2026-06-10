export type RepairStatus = 'fixed' | 'skipped' | 'manual_review' | 'failed';
export type RepairCategory =
  | 'absolute_path'
  | 'file_url'
  | 'external_reference'
  | 'missing_disclaimer'
  | 'missing_alias'
  | 'manifest_refresh'
  | 'markdown_footer'
  | 'html_footer'
  | 'json_alias'
  | 'release_alias';

export interface RepairAction {
  id: string;
  category: RepairCategory;
  file: string;
  status: RepairStatus;
  before?: string;
  after?: string;
  message: string;
  suggestedManualFix?: string;
  safe: boolean;
}

export interface RepairFinding {
  id: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  file?: string;
  suggestedManualFix?: string;
}

export interface RepairSummary {
  totalActions: number;
  fixedCount: number;
  skippedCount: number;
  manualReviewCount: number;
  failedCount: number;
  safeCount: number;
  unsafeCount: number;
}

export interface RepairResult {
  id: string;
  targetId: string;
  targetType: 'run' | 'batch';
  createdAt: string;
  status: RepairStatus;
  actions: RepairAction[];
  findings: RepairFinding[];
  summary: RepairSummary;
  disclaimer: string;
}
