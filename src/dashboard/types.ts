export interface DashboardSummary {
  totalRuns: number;
  totalBatches: number;
  totalReleaseChecks: number;
  latestRunId?: string;
  latestBatchId?: string;
  latestReleaseCheckId?: string;
  readyRunCount: number;
  notReadyRunCount: number;
  failedRunCount: number;
  warningRunCount: number;
  validatedRunCount: number;
  repairedRunCount: number;
  batchPassCount: number;
  batchWarnCount: number;
  batchFailCount: number;
  overallHealthScore: number;
}

export interface DashboardRunSummary {
  runId: string;
  templateId: string;
  status: string;
  verdict: string;
  reportHealth?: string;
  validationStatus?: 'pass' | 'warn' | 'fail';
  repairStatus?: 'fixed' | 'skipped' | 'manual_review' | 'failed';
  industryPackId?: string;
  createdAt?: string;
  artifactPath: string;
}

export interface DashboardBatchSummary {
  batchId: string;
  status: string;
  mode?: string;
  runCount: number;
  validationStatus?: 'pass' | 'warn' | 'fail';
  repairStatus?: 'fixed' | 'skipped' | 'manual_review' | 'failed';
  industryPackId?: string;
  createdAt?: string;
  artifactPath: string;
}

export interface DashboardReleaseSummary {
  id: string;
  status: 'pass' | 'warn' | 'fail';
  createdAt: string;
  checksTotal: number;
  checksPassed: number;
  checksWarned: number;
  checksFailed: number;
  artifactPath: string;
}

export interface DashboardRecommendation {
  priority: 'high' | 'medium' | 'low';
  category:
    | 'validation'
    | 'repair'
    | 'release'
    | 'coverage'
    | 'industry'
    | 'batch'
    | 'testing'
    | 'packaging'
    | 'manual_review';
  message: string;
  suggestedCommand?: string;
  reason: string;
}

export interface ProjectDashboard {
  dashboardId: string;
  createdAt: string;
  artifactRoot: string;
  status: 'local_ready' | 'local_ready_with_warnings' | 'not_ready' | 'needs_human_review';
  summary: DashboardSummary;
  runs: DashboardRunSummary[];
  batches: DashboardBatchSummary[];
  releaseChecks: DashboardReleaseSummary[];
  templates: {
    tested: string[];
    untested: string[];
    topByRunCount: { templateId: string; runCount: number }[];
  };
  industry: {
    packsUsed: string[];
    packsWithAssessment: string[];
    totalAssessments: number;
  };
  validation: {
    totalRunsValidated: number;
    totalRunsWithWarnings: number;
    totalRunsWithFailures: number;
    totalBatchesValidated: number;
    totalBatchesWithWarnings: number;
    totalBatchesWithFailures: number;
  };
  repair: {
    totalRunsRepaired: number;
    totalBatchesRepaired: number;
    totalManualReviewItems: number;
  };
  failures: {
    totalFailedSteps: number;
    failureTypes: Record<string, number>;
  };
  recommendations: DashboardRecommendation[];
  artifactLinks: {
    label: string;
    path: string;
    exists: boolean;
  }[];
  caveats: string[];
  disclaimer: string;
}
