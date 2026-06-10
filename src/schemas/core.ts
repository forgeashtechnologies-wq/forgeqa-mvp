import { z } from 'zod';

export const StepAction = z.enum([
  'navigate',
  'click',
  'fill',
  'upload',
  'assertText',
  'assertVisible',
  'assertHidden',
  'screenshot',
  'wait',
  'stop',
]);

export const StepStatus = z.enum([
  'pending',
  'running',
  'passed',
  'failed',
  'skipped',
]);

export const WorkflowStep = z.object({
  id: z.string(),
  order: z.number().int().nonnegative(),
  description: z.string().min(1),
  action: StepAction,
  target: z.string().optional(),
  value: z.string().optional(),
  screenshot: z.boolean().default(false),
  continueOnFailure: z.boolean().optional(),
});

export const WorkflowPlan = z.object({
  runId: z.string().min(1),
  templateId: z.string().min(1),
  templateName: z.string().min(1),
  description: z.string().min(1),
  baseUrl: z.string().optional(),
  steps: z.array(WorkflowStep).min(1),
  createdAt: z.string().datetime(),
});

export const GoldenUser = z.object({
  runId: z.string().min(1),
  e2eRunId: z.string().min(1),
  createdByForgeQA: z.literal(true),
  safeToDelete: z.literal(true),
  email: z.string().email().regex(/@(forgeqa\.test|forgecircle\.test|example\.test)$/),
  username: z.string().regex(/^fq_/),
  displayName: z.string().min(1),
  password: z.string().min(12),
  role: z.string().min(1),
  department: z.string().optional(),
  batch: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  profileType: z.string().optional(),
});

export const GoldenFile = z.object({
  runId: z.string().min(1),
  e2eRunId: z.string().min(1),
  createdByForgeQA: z.literal(true),
  safeToDelete: z.literal(true),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  content: z.instanceof(Buffer).or(z.string()),
  sha256: z.string().optional(),
  relativePath: z.string().optional(),
});

export const GoldenDataSet = z.object({
  runId: z.string().min(1),
  e2eRunId: z.string().min(1),
  createdByForgeQA: z.literal(true),
  safeToDelete: z.literal(true),
  generatedAt: z.string().datetime(),
  source: z.literal('forgeqa').optional(),
  profileType: z.string().optional(),
  templateId: z.string().optional(),
  users: z.array(GoldenUser),
  files: z.array(GoldenFile).default([]),
  forms: z.array(z.record(z.string())).optional(),
  tableRecords: z.array(z.record(z.unknown())).optional(),
});

const PatternFindingSchema = z.object({
  patternId: z.string(),
  message: z.string(),
  stepId: z.string().optional(),
  severity: z.enum(['error', 'warning', 'info']),
  title: z.string().optional(),
  category: z.string().optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  evidence: z.string().optional(),
  rootCause: z.string().optional(),
  howToConfirm: z.string().optional(),
  safeFix: z.string().optional(),
  preventionRule: z.string().optional(),
  regressionTest: z.string().optional(),
  sourceType: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourceConfidence: z.enum(['high', 'medium', 'low']).optional(),
  relatedPatterns: z.array(z.string()).optional(),
});

export const StepResult = z.object({
  stepId: z.string(),
  status: StepStatus,
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
  screenshotPath: z.string().optional(),
  domFindings: z.array(PatternFindingSchema).optional(),
  snapshotHtml: z.string().max(50000).optional(),
});

export const ViewportMeta = z.object({
  profile: z.string().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  isMobile: z.boolean().optional(),
  hasTouch: z.boolean().optional(),
  deviceScaleFactor: z.number().optional(),
});

export const StepPolicyDecisionSchema = z.object({
  allowed: z.boolean(),
  riskLevel: z.enum(['safe', 'caution', 'blocked']),
  reasonCode: z.string(),
  message: z.string(),
  stepId: z.string(),
  stepIndex: z.number(),
  action: z.string(),
  evidence: z.string().optional(),
  suggestedFix: z.string().optional(),
});

export const ExecutionPolicySummarySchema = z.object({
  mode: z.enum(['demo', 'external', 'dry-run-plan', 'diagnostic']),
  strictPolicy: z.boolean(),
  allowSubmit: z.boolean(),
  allowUpload: z.boolean(),
  approvedRiskReason: z.string().optional(),
  blockedCount: z.number(),
  cautionCount: z.number(),
  allowedCount: z.number(),
});

export const RunManifest = z.object({
  runId: z.string().min(1),
  e2eRunId: z.string().min(1),
  templateId: z.string().min(1),
  status: z.enum(['planned', 'running', 'completed', 'failed']),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  steps: z.array(StepResult),
  artifactsDir: z.string().min(1),
  isFinalized: z.boolean().default(false),
  domFindings: z.array(PatternFindingSchema).optional(),
  viewport: ViewportMeta.optional(),
  dryRun: z.boolean().optional(),
  policyDecisions: z.array(StepPolicyDecisionSchema).optional(),
  policyFindings: z.array(PatternFindingSchema).optional(),
  executionPolicy: ExecutionPolicySummarySchema.optional(),
  originalRunId: z.string().optional(),
  rerunOf: z.string().optional(),
  rerunCreatedAt: z.string().datetime().optional(),
});

export const CleanupItem = z.object({
  id: z.string(),
  type: z.string(),
  identifier: z.string(),
  safeToDelete: z.boolean(),
  wouldDelete: z.boolean(),
  reason: z.string(),
});

export const CleanupReport = z.object({
  runId: z.string().min(1),
  e2eRunId: z.string().min(1),
  generatedAt: z.string().datetime(),
  dryRun: z.literal(true),
  items: z.array(CleanupItem),
  summary: z.object({
    total: z.number().int().nonnegative(),
    safe: z.number().int().nonnegative(),
    unsafe: z.number().int().nonnegative(),
    wouldDelete: z.number().int().nonnegative(),
  }),
});

export const ReadinessVerdict = z.enum([
  'ready_for_demo',
  'conditionally_ready',
  'not_ready',
  'needs_human_review',
]);

export type StepAction = z.infer<typeof StepAction>;
export type StepStatus = z.infer<typeof StepStatus>;
export type WorkflowStep = z.infer<typeof WorkflowStep>;
export type WorkflowPlan = z.infer<typeof WorkflowPlan>;
export type GoldenUser = z.infer<typeof GoldenUser>;
export type GoldenFile = z.infer<typeof GoldenFile>;
export type GoldenDataSet = z.infer<typeof GoldenDataSet>;
export type StepResult = z.infer<typeof StepResult>;
export type RunManifest = z.infer<typeof RunManifest>;
export type ViewportMeta = z.infer<typeof ViewportMeta>;
export type CleanupItem = z.infer<typeof CleanupItem>;
export type CleanupReport = z.infer<typeof CleanupReport>;
export type ReadinessVerdict = z.infer<typeof ReadinessVerdict>;

// Golden Data v2 compatibility aliases
export type GoldenDataSetV2 = GoldenDataSet;
export type GoldenUserProfile = GoldenUser;
export type GoldenFileAsset = GoldenFile;
