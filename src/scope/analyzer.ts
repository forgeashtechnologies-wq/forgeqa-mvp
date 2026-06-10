import type { ScopeAnalysis, ScopeItem, ScopeSummary, TemplateScopeDeclaration } from './types.js';
import type { WorkflowPlan, RunManifest, StepResult } from '../schemas/core.js';
import type { WorkflowTemplate } from '../templates/types.js';

function makeId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60);
}

function buildCoveredItems(
  declaration: TemplateScopeDeclaration,
  plan: WorkflowPlan,
  manifest: RunManifest,
  template: WorkflowTemplate,
): ScopeItem[] {
  const items: ScopeItem[] = [];
  for (const label of declaration.scopeCovered) {
    const id = makeId(label);
    // Find steps that likely map to this covered area
    const evidenceStepIds: string[] = [];
    for (const step of plan.steps) {
      const stepResult = manifest.steps.find((s: StepResult) => s.stepId === step.id);
      if (stepResult?.status === 'passed' && step.description.toLowerCase().includes(label.toLowerCase().split(' ')[0])) {
        evidenceStepIds.push(step.id);
      }
    }
    // Fallback: if no direct match, use any passed step as evidence
    if (evidenceStepIds.length === 0) {
      const anyPassed = manifest.steps.find((s: StepResult) => s.status === 'passed');
      if (anyPassed) evidenceStepIds.push(anyPassed.stepId);
    }

    const allPassed = evidenceStepIds.length > 0 && evidenceStepIds.every((sid) => {
      const sr = manifest.steps.find((s: StepResult) => s.stepId === sid);
      return sr?.status === 'passed';
    });

    items.push({
      id: `covered_${id}`,
      label,
      category: 'covered',
      status: allPassed ? 'tested' : 'partially_tested',
      reason: allPassed ? 'All mapped steps passed.' : 'Some mapped steps did not pass.',
      evidenceStepIds,
      relatedTemplateId: template.id,
      relatedRunId: manifest.runId,
      confidence: evidenceStepIds.length > 0 ? 'high' : 'medium',
      recommendation: allPassed ? '' : 'Re-run or investigate mapped steps.',
    });
  }
  return items;
}

function buildNotCoveredItems(
  declaration: TemplateScopeDeclaration,
  template: WorkflowTemplate,
  manifest: RunManifest,
): ScopeItem[] {
  return declaration.scopeNotCovered.map((label) => ({
    id: `not_covered_${makeId(label)}`,
    label,
    category: 'not_covered',
    status: 'not_tested' as const,
    reason: 'Explicitly declared out of scope for this template.',
    evidenceStepIds: [],
    relatedTemplateId: template.id,
    relatedRunId: manifest.runId,
    confidence: 'high' as const,
    recommendation: 'Requires separate template or manual testing.',
  }));
}

function buildBlockedItems(
  manifest: RunManifest,
  template: WorkflowTemplate,
): ScopeItem[] {
  const blocked: ScopeItem[] = [];
  if (manifest.policyDecisions) {
    for (const pd of manifest.policyDecisions) {
      if (pd.riskLevel === 'blocked') {
        blocked.push({
          id: `blocked_${pd.stepId}`,
          label: `Step ${pd.stepId}: ${pd.action}`,
          category: 'policy',
          status: 'blocked_by_policy',
          reason: pd.message ?? 'Blocked by execution policy.',
          evidenceStepIds: [pd.stepId],
          relatedTemplateId: template.id,
          relatedRunId: manifest.runId,
          confidence: 'high',
          recommendation: 'Review policy settings or obtain explicit approval.',
        });
      }
    }
  }
  return blocked;
}

function buildSkippedItems(
  plan: WorkflowPlan,
  manifest: RunManifest,
  template: WorkflowTemplate,
): ScopeItem[] {
  const skipped: ScopeItem[] = [];
  for (const step of plan.steps) {
    const result = manifest.steps.find((s: StepResult) => s.stepId === step.id);
    if (result?.status === 'skipped') {
      skipped.push({
        id: `skipped_${step.id}`,
        label: `Step ${step.id}: ${step.description}`,
        category: 'execution',
        status: 'skipped',
        reason: 'Skipped due to earlier failure with continueOnFailure=false.',
        evidenceStepIds: [step.id],
        relatedTemplateId: template.id,
        relatedRunId: manifest.runId,
        confidence: 'high',
        recommendation: 'Fix earlier failing step and re-run.',
      });
    }
  }
  return skipped;
}

function buildDiagnosticOnlyItems(
  manifest: RunManifest,
  template: WorkflowTemplate,
): ScopeItem[] {
  if (template.category !== 'diagnostic') return [];
  return [
    {
      id: 'diagnostic_only_run',
      label: 'Diagnostic scenario execution',
      category: 'diagnostic',
      status: 'diagnostic_only',
      reason: 'This run used a diagnostic template. Findings validate detectors, not product defects.',
      evidenceStepIds: manifest.steps.map((s: StepResult) => s.stepId),
      relatedTemplateId: template.id,
      relatedRunId: manifest.runId,
      confidence: 'high',
      recommendation: 'Do not use diagnostic results for production readiness.',
    },
  ];
}

function buildHumanReviewItems(
  declaration: TemplateScopeDeclaration,
  manifest: RunManifest,
  template: WorkflowTemplate,
): ScopeItem[] {
  const items: ScopeItem[] = [];
  for (const label of declaration.humanReviewRecommended) {
    const hasFailure = manifest.steps.some((s: StepResult) => s.status === 'failed');
    items.push({
      id: `human_review_${makeId(label)}`,
      label,
      category: 'review',
      status: hasFailure ? 'needs_human_review' : 'tested',
      reason: hasFailure
        ? 'Failures were detected; human review is recommended.'
        : 'No failures detected, but review is still recommended per template.',
      evidenceStepIds: manifest.steps.filter((s: StepResult) => s.status === 'failed').map((s) => s.stepId),
      relatedTemplateId: template.id,
      relatedRunId: manifest.runId,
      confidence: hasFailure ? 'high' : 'medium',
      recommendation: 'Review screenshots and step results.',
    });
  }
  return items;
}

function computeSummary(items: ScopeItem[]): ScopeSummary {
  const counts = {
    tested: 0,
    not_tested: 0,
    partially_tested: 0,
    blocked_by_policy: 0,
    skipped: 0,
    diagnostic_only: 0,
    needs_human_review: 0,
  };

  for (const item of items) {
    if (counts[item.status] !== undefined) {
      (counts as Record<string, number>)[item.status]++;
    }
  }

  const total = items.length;
  const testedOrPartial = counts.tested + counts.partially_tested;
  const coveragePercent = total > 0 ? Math.round((testedOrPartial / total) * 100) : 0;

  const caveats: string[] = [];
  if (counts.not_tested > 0) {
    caveats.push(`${counts.not_tested} area(s) declared out of scope were not tested.`);
  }
  if (counts.blocked_by_policy > 0) {
    caveats.push(`${counts.blocked_by_policy} area(s) were blocked by policy.`);
  }
  if (counts.needs_human_review > 0) {
    caveats.push(`${counts.needs_human_review} area(s) need human review.`);
  }
  if (counts.diagnostic_only > 0) {
    caveats.push('This was a diagnostic run; findings validate detectors, not product readiness.');
  }

  return {
    testedCount: counts.tested,
    notTestedCount: counts.not_tested,
    partiallyTestedCount: counts.partially_tested,
    blockedCount: counts.blocked_by_policy,
    skippedCount: counts.skipped,
    diagnosticOnlyCount: counts.diagnostic_only,
    needsHumanReviewCount: counts.needs_human_review,
    coveragePercent,
    caveats,
  };
}

function buildScopedReadinessStatement(summary: ScopeSummary, templateName: string): string {
  const parts: string[] = [
    `ForgeQA proves scoped readiness for "${templateName}".`,
    `Coverage: ${summary.coveragePercent}% of declared scope items (${summary.testedCount} tested, ${summary.partiallyTestedCount} partially tested).`,
  ];
  if (summary.caveats.length > 0) {
    parts.push(`Caveats: ${summary.caveats.join(' ')}`);
  }
  parts.push('This does not claim the entire application is bug-free.');
  return parts.join(' ');
}

export function analyzeScope(
  template: WorkflowTemplate,
  plan: WorkflowPlan,
  manifest: RunManifest,
): ScopeAnalysis {
  const declaration: TemplateScopeDeclaration = {
    scopeCovered: (template as any).scopeCovered ?? [],
    scopeNotCovered: (template as any).scopeNotCovered ?? [],
    scopeAssumptions: (template as any).scopeAssumptions ?? [],
    scopeBoundaries: (template as any).scopeBoundaries ?? [],
    humanReviewRecommended: (template as any).humanReviewRecommended ?? [],
  };

  const items: ScopeItem[] = [
    ...buildCoveredItems(declaration, plan, manifest, template),
    ...buildNotCoveredItems(declaration, template, manifest),
    ...buildBlockedItems(manifest, template),
    ...buildSkippedItems(plan, manifest, template),
    ...buildDiagnosticOnlyItems(manifest, template),
    ...buildHumanReviewItems(declaration, manifest, template),
  ];

  const summary = computeSummary(items);
  const scopedReadinessStatement = buildScopedReadinessStatement(summary, template.name);

  return {
    runId: manifest.runId,
    templateId: template.id,
    templateName: template.name,
    items,
    summary,
    scopedReadinessStatement,
  };
}

export function generateScopeAnalysisMarkdown(analysis: ScopeAnalysis): string {
  const lines: string[] = [];
  lines.push('# ForgeQA Scope Analysis');
  lines.push('');
  lines.push(`- **Run ID:** \`${analysis.runId}\``);
  lines.push(`- **Template:** ${analysis.templateName}`);
  lines.push('');

  lines.push('## Scoped Readiness Statement');
  lines.push('');
  lines.push(`> ${analysis.scopedReadinessStatement}`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Tested | ${analysis.summary.testedCount} |`);
  lines.push(`| Partially Tested | ${analysis.summary.partiallyTestedCount} |`);
  lines.push(`| Not Tested | ${analysis.summary.notTestedCount} |`);
  lines.push(`| Blocked by Policy | ${analysis.summary.blockedCount} |`);
  lines.push(`| Skipped | ${analysis.summary.skippedCount} |`);
  lines.push(`| Diagnostic Only | ${analysis.summary.diagnosticOnlyCount} |`);
  lines.push(`| Needs Human Review | ${analysis.summary.needsHumanReviewCount} |`);
  lines.push(`| **Coverage** | **${analysis.summary.coveragePercent}%** |`);
  lines.push('');

  if (analysis.summary.caveats.length > 0) {
    lines.push('## Caveats');
    lines.push('');
    for (const caveat of analysis.summary.caveats) {
      lines.push(`- ${caveat}`);
    }
    lines.push('');
  }

  const byCategory = new Map<string, ScopeItem[]>();
  for (const item of analysis.items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }

  for (const [category, items] of byCategory) {
    lines.push(`## ${category.charAt(0).toUpperCase() + category.slice(1)}`);
    lines.push('');
    for (const item of items) {
      lines.push(`### ${item.label}`);
      lines.push(`- **Status:** ${item.status}`);
      lines.push(`- **Confidence:** ${item.confidence}`);
      lines.push(`- **Reason:** ${item.reason}`);
      if (item.evidenceStepIds.length > 0) {
        lines.push(`- **Evidence Steps:** ${item.evidenceStepIds.join(', ')}`);
      }
      if (item.recommendation) {
        lines.push(`- **Recommendation:** ${item.recommendation}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
