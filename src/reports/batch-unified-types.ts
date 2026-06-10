export interface UnifiedBatchPlanSummary {
  promptCount: number;
  prompts: string[];
  templateIds: string[];
  demo: boolean;
  external: boolean;
  dryRun: boolean;
  industryMappingStatus?: string;
  missingRecommendedTemplates?: string[];
}

export interface UnifiedBatchResultSummary {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  notReadyRuns: number;
  readyRuns: number;
  dryRunCount: number;
  totalDurationMs?: number;
  runIds: string[];
}

export interface UnifiedBatchValidationSummary {
  status: 'pass' | 'warn' | 'fail';
  checkCount: number;
  warnings: number;
  failures: number;
  missingFiles: string[];
  brokenLinks: string[];
  validationArtifactPath: string;
}

export interface UnifiedBatchRepairSummary {
  status: 'fixed' | 'skipped' | 'manual_review' | 'failed';
  totalActions: number;
  fixedCount: number;
  skippedCount: number;
  manualReviewCount: number;
  failedCount: number;
  repairArtifactPath: string;
}

export interface UnifiedBatchManifestSummary {
  artifactCount: number;
  validationStatus: string;
  requiredMissingCount: number;
  runIds: string[];
  manifestPath: string;
}

export interface UnifiedBatchIndustrySummary {
  packId: string;
  packName: string;
  status: string;
  score: number;
  requiredItemsTested: string[];
  requiredItemsMissing: string[];
  recommendedItemsMissing: string[];
  blockedByPolicyItems: string[];
  recommendations: string[];
  industryAssessmentPath: string;
}

export interface UnifiedBatchRunSummary {
  runId: string;
  prompt?: string;
  templateId?: string;
  status: string;
  verdict: string;
  validationStatus?: 'pass' | 'warn' | 'fail';
  repairStatus?: 'fixed' | 'skipped' | 'manual_review' | 'failed';
  unifiedReportPath?: string;
  reportPath?: string;
  artifactPath: string;
}

export interface UnifiedBatchFinding {
  severity: 'info' | 'warning' | 'error' | 'critical';
  source: 'batch_plan' | 'batch_result' | 'batch_validation' | 'batch_repair' | 'batch_manifest' | 'industry' | 'linked_run';
  title: string;
  message: string;
  file?: string;
  runId?: string;
  suggestedFix?: string;
}

export interface UnifiedBatchReport {
  batchId: string;
  createdAt: string;
  status: string;
  mode?: string;
  industryPackId?: string;
  industryPackName?: string;
  plan: UnifiedBatchPlanSummary;
  result?: UnifiedBatchResultSummary;
  validation: UnifiedBatchValidationSummary;
  repair?: UnifiedBatchRepairSummary;
  manifest: UnifiedBatchManifestSummary;
  industry?: UnifiedBatchIndustrySummary;
  runSummaries: UnifiedBatchRunSummary[];
  summary: {
    totalFindings: number;
    totalRepairActions: number;
    manualReviewItems: number;
    missingLinkedRuns: number;
  };
  findings: UnifiedBatchFinding[];
  repairActions: {
    id: string;
    category: string;
    status: string;
    message: string;
    file?: string;
    safe: boolean;
  }[];
  recommendedNextSteps: string[];
  artifactLinks: {
    label: string;
    path: string;
    exists: boolean;
    category: 'core' | 'validation' | 'repair' | 'report' | 'industry' | 'manifest';
  }[];
  caveats: string[];
  disclaimer: string;
}
