export type FailureType =
  | 'app_bug'
  | 'test_bug'
  | 'environment_issue'
  | 'data_issue'
  | 'policy_block'
  | 'expected_diagnostic_failure'
  | 'product_gap'
  | 'unknown_needs_human_review';

export type SuggestedOwner =
  | 'product'
  | 'frontend'
  | 'backend'
  | 'qa'
  | 'devops'
  | 'security'
  | 'human_review';

export interface FailureClassification {
  stepId: string;
  stepIndex: number;
  failureType: FailureType;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  evidence: string;
  suggestedOwner: SuggestedOwner;
  recommendedNextAction: string;
}

export interface FailureClassificationReport {
  runId: string;
  templateId: string;
  classifications: FailureClassification[];
  summary: {
    totalFailedSteps: number;
    appBugCount: number;
    testBugCount: number;
    environmentIssueCount: number;
    dataIssueCount: number;
    policyBlockCount: number;
    expectedDiagnosticCount: number;
    productGapCount: number;
    unknownCount: number;
  };
}
