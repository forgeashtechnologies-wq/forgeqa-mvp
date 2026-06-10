export interface UnifiedValidationSummary {
  status: 'pass' | 'warn' | 'fail';
  checkCount: number;
  warnings: number;
  failures: number;
  findings: number;
  validationArtifactPath: string;
}

export interface UnifiedRepairSummary {
  status: 'fixed' | 'skipped' | 'manual_review' | 'failed';
  totalActions: number;
  fixedCount: number;
  skippedCount: number;
  manualReviewCount: number;
  failedCount: number;
  safeCount: number;
  unsafeCount: number;
  repairArtifactPath: string;
}

export interface UnifiedFinding {
  severity: 'info' | 'warning' | 'error' | 'critical';
  source: 'validation' | 'repair' | 'run' | 'policy' | 'data_safety' | 'scope' | 'failure_classification';
  title: string;
  message: string;
  file?: string;
  suggestedFix?: string;
}

export interface UnifiedArtifactLink {
  label: string;
  path: string;
  exists: boolean;
  category: 'core' | 'validation' | 'repair' | 'report' | 'evidence' | 'audit' | 'policy';
}

export interface UnifiedRunReport {
  runId: string;
  createdAt: string;
  status: string;
  verdict: string;
  templateId: string;
  templateName?: string;
  mode?: string;
  viewport?: {
    profile?: string;
    width?: number;
    height?: number;
    isMobile?: boolean;
  };
  validation: UnifiedValidationSummary;
  repair?: UnifiedRepairSummary;
  summary: {
    totalFindings: number;
    totalRepairActions: number;
    manualReviewItems: number;
  };
  findings: UnifiedFinding[];
  repairActions: {
    id: string;
    category: string;
    status: string;
    message: string;
    file?: string;
    safe: boolean;
  }[];
  recommendedNextSteps: string[];
  artifactLinks: UnifiedArtifactLink[];
  caveats: string[];
  disclaimer: string;
}
