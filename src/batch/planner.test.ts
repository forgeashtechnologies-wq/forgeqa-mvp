import { describe, it, expect } from 'vitest';
import { createBatchPlan, generateBatchPlanMarkdown } from './planner.js';
import type { BatchOptions } from './types.js';

describe('Batch Planner', () => {
  const defaultOptions: BatchOptions = {
    mode: 'demo',
    viewport: 'desktop',
    strictPolicy: false,
    includeDiagnostics: false,
    includePolicy: false,
    approveExternal: false,
    json: true,
    quiet: false,
    verbose: false,
  };

  it('creates batch plan from valid prompts', () => {
    const plan = createBatchPlan(['search and pagination', 'mobile responsive check'], defaultOptions);
    expect(plan.batchId).toBeDefined();
    expect(plan.batchId.length).toBeGreaterThan(8);
    expect(plan.resolvedTemplates.length).toBe(2);
    expect(plan.skippedPrompts.length).toBe(0);
    expect(plan.estimatedRunCount).toBe(2);
    expect(plan.policySummary.totalItems).toBe(2);
  });

  it('skips unsupported prompts with suggestions', () => {
    const plan = createBatchPlan(['search and pagination', 'nonexistent xyz123'], defaultOptions);
    expect(plan.resolvedTemplates.length).toBe(1);
    expect(plan.skippedPrompts.length).toBe(1);
    expect(plan.skippedPrompts[0].reason).toContain('No matching template');
  });

  it('blocks diagnostics unless includeDiagnostics', () => {
    const plan = createBatchPlan(['diagnostic broken selector'], defaultOptions);
    expect(plan.resolvedTemplates.length).toBe(0);
    expect(plan.skippedPrompts.length).toBe(1);
    expect(plan.skippedPrompts[0].reason).toContain('--include-diagnostics');
  });

  it('blocks policy templates unless includePolicy', () => {
    const plan = createBatchPlan(['policy destructive action gate'], defaultOptions);
    expect(plan.resolvedTemplates.length).toBe(0);
    expect(plan.skippedPrompts.length).toBe(1);
    expect(plan.skippedPrompts[0].reason).toContain('--include-policy');
  });

  it('includes diagnostics with includeDiagnostics flag', () => {
    const plan = createBatchPlan(['diagnostic broken selector'], { ...defaultOptions, includeDiagnostics: true });
    expect(plan.resolvedTemplates.length).toBe(1);
    expect(plan.skippedPrompts.length).toBe(0);
  });

  it('includes policy templates with includePolicy flag', () => {
    const plan = createBatchPlan(['policy destructive action gate'], { ...defaultOptions, includePolicy: true });
    expect(plan.resolvedTemplates.length).toBe(1);
    expect(plan.skippedPrompts.length).toBe(0);
  });

  it('produces valid markdown plan', () => {
    const plan = createBatchPlan(['search and pagination'], defaultOptions);
    const md = generateBatchPlanMarkdown(plan);
    expect(md).toContain('ForgeQA Batch Plan');
    expect(md).toContain(plan.batchId);
    expect(md).toContain('search and pagination');
  });

  it('marks policy items as requiring approval', () => {
    const plan = createBatchPlan(
      ['policy destructive action gate'],
      { ...defaultOptions, includePolicy: true },
    );
    expect(plan.resolvedTemplates[0].requiresApproval).toBe(true);
    expect(plan.resolvedTemplates[0].expectedRisk).toBe('high');
  });
});
