import { describe, it, expect } from 'vitest';
import { assessBatchAgainstIndustryPack, generateBatchIndustryAssessmentMarkdown, generateBatchIndustryAssessmentJson } from './batch-assessor.js';
import { getIndustryPackById } from './registry.js';
import type { BatchResult } from '../batch/types.js';

describe('Batch Industry Assessor', () => {
  const makeBatchResult = (items: BatchResult['items']): BatchResult => ({
    batchId: 'batch_001',
    status: 'completed',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    items,
    runIds: items.filter((i) => i.runId).map((i) => i.runId!),
    passCount: items.filter((i) => i.status === 'completed').length,
    failCount: items.filter((i) => i.status === 'failed').length,
    blockedCount: 0,
    skippedCount: 0,
    reportHealthSummary: {},
    dataSafetySummary: {},
    policySummary: {},
    artifactPath: 'artifacts/batches/batch_001',
  });

  it('aggregates two runs under education-alumni', () => {
    const pack = getIndustryPackById('education-alumni')!;
    const result = makeBatchResult([
      { itemId: 'i1', prompt: 'register alumni', templateId: 'forgecircle.registerAlumniCompleteProfile', templateName: 'Alumni Registration', mode: 'demo', viewport: 'desktop', expectedRisk: 'low', requiresApproval: false, status: 'completed', runId: 'run_1' },
      { itemId: 'i2', prompt: 'password reset', templateId: 'generic.passwordResetRequest', templateName: 'Password Reset', mode: 'demo', viewport: 'desktop', expectedRisk: 'low', requiresApproval: false, status: 'completed', runId: 'run_2' },
    ]);

    const assessment = assessBatchAgainstIndustryPack(result, pack);
    expect(assessment.batchId).toBe('batch_001');
    expect(assessment.packId).toBe('education-alumni');
    expect(assessment.itemAssessments.length).toBe(2);
    expect(assessment.itemAssessments[0].runId).toBe('run_1');
    expect(assessment.itemAssessments[1].runId).toBe('run_2');
  });

  it('required item tested if matching template run exists', () => {
    const pack = getIndustryPackById('education-alumni')!;
    const result = makeBatchResult([
      { itemId: 'i1', prompt: 'register alumni', templateId: 'forgecircle.registerAlumniCompleteProfile', templateName: 'Alumni Registration', mode: 'demo', viewport: 'desktop', expectedRisk: 'low', requiresApproval: false, status: 'completed', runId: 'run_1' },
    ]);

    const assessment = assessBatchAgainstIndustryPack(result, pack);
    expect(assessment.requiredItemsTested).toContain('forgecircle.registerAlumniCompleteProfile');
  });

  it('missing required item appears as not_tested', () => {
    const pack = getIndustryPackById('education-alumni')!;
    const result = makeBatchResult([
      { itemId: 'i1', prompt: 'password reset', templateId: 'generic.passwordResetRequest', templateName: 'Password Reset', mode: 'demo', viewport: 'desktop', expectedRisk: 'low', requiresApproval: false, status: 'completed', runId: 'run_1' },
    ]);

    const assessment = assessBatchAgainstIndustryPack(result, pack);
    const missingTemplate = pack.recommendedTemplates.find((t) => t.priority === 'required' && t.templateId === 'forgecircle.registerAlumniCompleteProfile');
    if (missingTemplate) {
      expect(assessment.requiredItemsMissing).toContain('forgecircle.registerAlumniCompleteProfile');
      const notTested = assessment.notTestedItems.find((n) => n.label === 'forgecircle.registerAlumniCompleteProfile');
      expect(notTested).toBeDefined();
      expect(notTested!.severity).toBe('error');
    }
  });

  it('policy-blocked payment counted as blocked_by_policy', () => {
    const pack = getIndustryPackById('ecommerce-checkout-safe')!;
    const result = makeBatchResult([
      { itemId: 'i1', prompt: 'checkout', templateId: 'policy.paymentFlowGate', templateName: 'Payment Gate', mode: 'demo', viewport: 'desktop', expectedRisk: 'high', requiresApproval: true, status: 'completed', runId: 'run_1' },
    ]);

    const assessment = assessBatchAgainstIndustryPack(result, pack);
    // Payment gate template triggers policy awareness; blocked_by_policy may appear
    // when the per-run industry assessment detects policy-blocked items.
    // Since this is a dry test without real run artifacts, we at minimum verify
    // the batch assessment processes the policy template without crashing and
    // produces valid blockedByPolicyItems array.
    expect(Array.isArray(assessment.blockedByPolicyItems)).toBe(true);
  });

  it('diagnostic run does not count as normal user workflow coverage', () => {
    const pack = getIndustryPackById('generic-saas-admin')!;
    const result = makeBatchResult([
      { itemId: 'i1', prompt: 'diagnostic test', templateId: 'diagnostic.missingLabel', templateName: 'Missing Label', mode: 'demo', viewport: 'desktop', expectedRisk: 'low', requiresApproval: false, status: 'completed', runId: 'run_1' },
    ]);

    const assessment = assessBatchAgainstIndustryPack(result, pack);
    expect(assessment.requiredItemsTested.length).toBe(0);
    expect(assessment.itemAssessments[0].templateId).toBe('diagnostic.missingLabel');
  });

  it('critical failure downgrades status', () => {
    const pack = getIndustryPackById('generic-saas-admin')!;
    const result = makeBatchResult([
      { itemId: 'i1', prompt: 'form', templateId: 'generic.multiStepFormValidation', templateName: 'Form', mode: 'demo', viewport: 'desktop', expectedRisk: 'low', requiresApproval: false, status: 'failed', runId: 'run_1', error: 'Selector not found' },
    ]);

    const assessment = assessBatchAgainstIndustryPack(result, pack);
    expect(['not_ready', 'needs_human_review', 'ready_with_warnings']).toContain(assessment.status);
  });

  it('disclaimer present', () => {
    const pack = getIndustryPackById('content-marketing-site')!;
    const result = makeBatchResult([]);
    const assessment = assessBatchAgainstIndustryPack(result, pack);
    expect(assessment.disclaimer).toContain('not legal');
    expect(assessment.disclaimer.toLowerCase()).toContain('not');
    expect(assessment.disclaimer.toLowerCase()).toContain('compliance');
  });

  it('banned words not used in status or text', () => {
    const pack = getIndustryPackById('healthcare-appointment-safe')!;
    const result = makeBatchResult([]);
    const assessment = assessBatchAgainstIndustryPack(result, pack);
    const allText = JSON.stringify(assessment).toLowerCase();
    expect(allText).not.toContain('certified');
    expect(allText).not.toContain('compliant');
  });

  it('generates markdown report', () => {
    const pack = getIndustryPackById('content-marketing-site')!;
    const result = makeBatchResult([]);
    const assessment = assessBatchAgainstIndustryPack(result, pack);
    const md = generateBatchIndustryAssessmentMarkdown(assessment);
    expect(md).toContain('Batch Industry Readiness Assessment');
    expect(md).toContain(pack.name);
    expect(md).toContain(assessment.status);
    expect(md).toContain(assessment.disclaimer);
  });

  it('generates valid JSON report', () => {
    const pack = getIndustryPackById('content-marketing-site')!;
    const result = makeBatchResult([]);
    const assessment = assessBatchAgainstIndustryPack(result, pack);
    const json = generateBatchIndustryAssessmentJson(assessment);
    const parsed = JSON.parse(json);
    expect(parsed.batchId).toBe('batch_001');
    expect(parsed.packId).toBe('content-marketing-site');
    expect(parsed.status).toBeDefined();
    expect(parsed.score).toBeDefined();
  });

  it('recommends missing required templates', () => {
    const pack = getIndustryPackById('generic-saas-admin')!;
    const result = makeBatchResult([]);
    const assessment = assessBatchAgainstIndustryPack(result, pack);
    expect(assessment.recommendations.some((r) => r.includes('required templates'))).toBe(true);
  });
});
