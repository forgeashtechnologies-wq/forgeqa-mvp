export type IndustryPackId =
  | 'generic-saas-admin'
  | 'education-alumni'
  | 'ecommerce-checkout-safe'
  | 'healthcare-appointment-safe'
  | 'content-marketing-site';

export type TemplatePriority = 'required' | 'recommended' | 'optional';
export type IndustryPackStatus = 'ready' | 'ready_with_warnings' | 'not_ready' | 'needs_human_review';
export type AppRiskLevel = 'low' | 'medium' | 'high';

export interface RecommendedTemplate {
  templateId: string;
  priority: TemplatePriority;
  reason: string;
  appliesToModes: ('demo' | 'external' | 'both')[];
}

export interface IndustryReadinessCriterion {
  id: string;
  label: string;
  category: string;
  required: boolean;
  evidenceSources: string[];
  passCondition: string;
  failCondition: string;
  notTestedMessage: string;
}

export interface IndustryPack {
  id: IndustryPackId;
  name: string;
  version: string;
  description: string;
  appCategory: string;
  targetUsers: string[];
  riskLevel: AppRiskLevel;
  recommendedTemplates: RecommendedTemplate[];
  optionalTemplates: RecommendedTemplate[];
  blockedTemplates: string[];
  scannerFocus: string[];
  requiredScopeItems: IndustryReadinessCriterion[];
  notTestedWarnings: string[];
  policyFocus: string[];
  accessibilityFocus: string[];
  securityFocus: string[];
  dataSafetyFocus: string[];
  reportLanguage: string;
  readinessCriteria: IndustryReadinessCriterion[];
  caveats: string[];
  references: string[];
}

export interface IndustryPackAssessment {
  packId: IndustryPackId;
  packName: string;
  runId?: string;
  scanId?: string;
  status: IndustryPackStatus;
  score: number;
  requiredCoverage: number;
  missingRequiredItems: Array<{
    criterionId: string;
    label: string;
    reason: string;
  }>;
  warnings: string[];
  recommendations: string[];
  notTestedItems: Array<{
    label: string;
    reason: string;
    severity: 'info' | 'warning' | 'error';
  }>;
  blockedByPolicyItems: Array<{
    label: string;
    reason: string;
  }>;
  evidenceLinks: Array<{
    type: string;
    path: string;
    description: string;
  }>;
  caveats: string[];
  disclaimer: string;
  assessedAt: string;
}

export interface IndustryPackRecommendation {
  packId: IndustryPackId;
  packName: string;
  confidence: number;
  reason: string;
  matchedIndicators: string[];
}
