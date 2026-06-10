export type BatchValidationStatus = 'pass' | 'warn' | 'fail';

export type BatchValidationCheckCategory =
  | 'required_file'
  | 'json_validity'
  | 'markdown_integrity'
  | 'linked_run'
  | 'linked_artifact'
  | 'industry_assessment'
  | 'disclaimer'
  | 'portability'
  | 'checksum'
  | 'schema';

export interface BatchValidationCheck {
  id: string;
  label: string;
  category: BatchValidationCheckCategory;
  status: 'pass' | 'warn' | 'fail' | 'not_applicable';
  message: string;
  evidence?: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

export interface BatchValidationFinding {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  file?: string;
  suggestedFix?: string;
  relatedPatternId?: string;
}

export interface BatchValidationSummary {
  totalChecks: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  notApplicableCount: number;
  missingFiles: string[];
  brokenLinks: string[];
  invalidJsonFiles: string[];
  absolutePathFindings: string[];
  certificationClaimFindings: string[];
  missingDisclaimerFindings: string[];
  linkedRunFailures: string[];
}

export interface BatchValidationResult {
  batchId: string;
  status: BatchValidationStatus;
  validatedAt: string;
  batchDir: string;
  checks: BatchValidationCheck[];
  findings: BatchValidationFinding[];
  summary: BatchValidationSummary;
}

export interface BatchManifestArtifact {
  relativePath: string;
  sizeBytes: number;
  sha256: string;
  category: 'plan' | 'result' | 'industry' | 'validation' | 'comparison' | 'report';
  required: boolean;
  present: boolean;
}

export interface BatchManifest {
  batchId: string;
  createdAt: string;
  updatedAt: string;
  artifactCount: number;
  artifacts: BatchManifestArtifact[];
  batchStatus: string;
  validationStatus: string;
  runIds: string[];
  industryPackId?: string;
  caveats: string[];
  disclaimer: string;
}
