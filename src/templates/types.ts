import type { WorkflowStep } from '../schemas/core.js';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedDurationSeconds: number;
  requiredData: 'none' | 'users' | 'files' | 'users_and_files';
  tags: string[];
  roles: string[];
  supportedModes: ('demo' | 'external')[];
  demoRoutes: string[];
  riskLevel: 'low' | 'medium' | 'high';
  requiresAuth: boolean;
  requiresNetwork: boolean;
  requiresFileUpload: boolean;
  destructiveAction: boolean;
  expectedArtifacts: string[];
  promptMatchers: string[];
  matchers: string[];
  baseUrl: string;
  steps: Omit<WorkflowStep, 'id'>[];
  defaultViewport?: 'desktop' | 'mobile' | 'tablet' | 'small-mobile';
  supportedViewports?: string[];
  responsiveAssertions?: boolean;
  allowExternalSubmit?: boolean;
  allowExternalUpload?: boolean;
  allowedExternalActions?: string[];
  blockedExternalActions?: string[];
  mutationRisk?: 'none' | 'low' | 'medium' | 'high';
  requiresHumanApproval?: boolean;
  expectedMutationScope?: 'none' | 'local_only' | 'generated_data_only' | 'external_app';
  fixtureRoute?: string;
  fixturePath?: string;
  requiredFixtureTestIds?: string[];
  expectedMissingSelectors?: boolean;
  fixtureValidationMode?: 'strict' | 'diagnostic' | 'none';
  scopeCovered?: string[];
  scopeNotCovered?: string[];
  scopeAssumptions?: string[];
  scopeBoundaries?: string[];
  humanReviewRecommended?: string[];
}

export interface MatchedTemplate {
  template: WorkflowTemplate;
  confidence: 'exact' | 'matcher' | 'tag' | 'fuzzy';
}

export type PromptMatchResult =
  | { matched: true; template: WorkflowTemplate; confidence: 'exact' | 'matcher' | 'tag' | 'fuzzy' }
  | { matched: false; error: 'NO_MATCH'; suggestions: string[] };

export interface PlanContext {
  runId: string;
  e2eRunId: string;
  templateId: string;
  baseUrl: string;
}
