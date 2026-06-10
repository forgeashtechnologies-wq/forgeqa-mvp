export interface BatchItem {
  itemId: string;
  prompt: string;
  templateId: string;
  templateName: string;
  mode: 'demo' | 'external' | 'dry-run-plan' | 'policy-preview';
  viewport: string;
  baseUrl?: string;
  expectedRisk: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
  status: 'planned' | 'skipped' | 'running' | 'completed' | 'failed' | 'blocked';
  skipReason?: string;
  runId?: string;
  e2eRunId?: string;
  error?: string;
  verdict?: string;
  reportHealth?: string;
}

export interface BatchPlan {
  batchId: string;
  createdAt: string;
  mode: 'demo' | 'external' | 'dry-run-plan' | 'policy-preview';
  requestedPrompts: string[];
  resolvedTemplates: BatchItem[];
  skippedPrompts: Array<{ prompt: string; reason: string; suggestions?: string[] }>;
  executionOrder: string[]; // itemIds
  policySummary: {
    totalItems: number;
    approvedItems: number;
    cautionItems: number;
    blockedItems: number;
    skippedItems: number;
  };
  estimatedRunCount: number;
  warnings: string[];
  errors: string[];
  industryPackId?: string;
  industryPackName?: string;
  industryRecommendations?: Array<{ packId: string; packName: string; confidence: number; reason: string }>;
  industryMapping?: {
    requiredItemsCovered: string[];
    requiredItemsMissing: string[];
    recommendedItemsCovered: string[];
    recommendedItemsMissing: string[];
    blockedTemplates: string[];
    caveats: string[];
  };
}

export interface BatchResult {
  batchId: string;
  status: 'completed' | 'completed_with_failures' | 'failed' | 'blocked';
  startedAt: string;
  completedAt: string;
  items: BatchItem[];
  runIds: string[];
  passCount: number;
  failCount: number;
  blockedCount: number;
  skippedCount: number;
  reportHealthSummary: Record<string, string>;
  dataSafetySummary: Record<string, string>;
  policySummary: Record<string, unknown>;
  artifactPath: string;
  scopeSummary?: {
    totalTested: number;
    totalNotTested: number;
    totalNeedsHumanReview: number;
    totalCoveragePercent: number;
  };
  failureSummary?: {
    appBugCount: number;
    testBugCount: number;
    environmentIssueCount: number;
    dataIssueCount: number;
    policyBlockCount: number;
    expectedDiagnosticCount: number;
    productGapCount: number;
    unknownCount: number;
  };
  galleryLinks?: Record<string, string>;
  industryPackId?: string;
  industryPackName?: string;
  industryAssessment?: {
    status: string;
    score: number;
    requiredCoverage: number;
    requiredItemsTested: string[];
    requiredItemsMissing: string[];
    recommendedItemsTested: string[];
    recommendedItemsMissing: string[];
    notTestedItems: Array<{ label: string; reason: string; severity: string }>;
    blockedByPolicyItems: Array<{ label: string; reason: string }>;
    warnings: string[];
    recommendations: string[];
    caveats: string[];
    disclaimer: string;
  };
}

export interface BatchOptions {
  mode: 'demo' | 'external';
  viewport: string;
  strictPolicy: boolean;
  includeDiagnostics: boolean;
  includePolicy: boolean;
  approveExternal: boolean;
  approveRisk?: string;
  baseUrl?: string;
  industry?: string;
  recommendIndustry?: boolean;
  includeIndustryCaveats?: boolean;
  json: boolean;
  quiet: boolean;
  verbose: boolean;
}
