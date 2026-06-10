export type ScopeStatus =
  | 'tested'
  | 'not_tested'
  | 'partially_tested'
  | 'blocked_by_policy'
  | 'skipped'
  | 'diagnostic_only'
  | 'needs_human_review';

export interface ScopeItem {
  id: string;
  label: string;
  category: string;
  status: ScopeStatus;
  reason: string;
  evidenceStepIds: string[];
  relatedTemplateId: string;
  relatedRunId: string;
  confidence: 'high' | 'medium' | 'low';
  recommendation: string;
}

export interface ScopeSummary {
  testedCount: number;
  notTestedCount: number;
  partiallyTestedCount: number;
  blockedCount: number;
  skippedCount: number;
  diagnosticOnlyCount: number;
  needsHumanReviewCount: number;
  coveragePercent: number;
  caveats: string[];
}

export interface ScopeAnalysis {
  runId: string;
  templateId: string;
  templateName: string;
  items: ScopeItem[];
  summary: ScopeSummary;
  scopedReadinessStatement: string;
}

export interface TemplateScopeDeclaration {
  scopeCovered: string[];
  scopeNotCovered: string[];
  scopeAssumptions: string[];
  scopeBoundaries: string[];
  humanReviewRecommended: string[];
}
