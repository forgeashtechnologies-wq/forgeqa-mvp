import type { FailureClassification, FailureClassificationReport, FailureType, SuggestedOwner } from './types.js';
import type { WorkflowPlan, RunManifest, StepResult } from '../schemas/core.js';
import type { WorkflowTemplate } from '../templates/types.js';

function classifyError(
  error: string,
  stepAction: string,
  _stepTarget: string | undefined,
  templateCategory: string,
  isPolicyBlocked: boolean,
  expectedMissingSelectors: boolean | undefined,
): { type: FailureType; owner: SuggestedOwner; confidence: 'high' | 'medium' | 'low'; reason: string; nextAction: string } {
  const err = error.toLowerCase();

  // Policy block
  if (isPolicyBlocked || err.includes('policy_blocked')) {
    return {
      type: 'policy_block',
      owner: 'security',
      confidence: 'high',
      reason: 'Step was blocked by execution policy.',
      nextAction: 'Review policy settings or obtain explicit risk approval.',
    };
  }

  // Expected diagnostic failure
  if (templateCategory === 'diagnostic' && expectedMissingSelectors) {
    return {
      type: 'expected_diagnostic_failure',
      owner: 'qa',
      confidence: 'high',
      reason: 'This is an expected diagnostic failure that validates the detector.',
      nextAction: 'Verify detector behavior is correct; no product fix needed.',
    };
  }

  if (templateCategory === 'diagnostic') {
    return {
      type: 'expected_diagnostic_failure',
      owner: 'qa',
      confidence: 'high',
      reason: 'Diagnostic template run. Any failure is expected by design.',
      nextAction: 'Verify detector behavior is correct; no product fix needed.',
    };
  }

  // Environment issues
  if (
    err.includes('browser') && err.includes('not installed') ||
    err.includes('executable') && err.includes('not found') ||
    err.includes('econnrefused') ||
    err.includes('timeout') && err.includes('exceeded') ||
    err.includes('demo server') && err.includes('failed') ||
    err.includes('port') && err.includes('use') ||
    err.includes('network') && err.includes('error')
  ) {
    return {
      type: 'environment_issue',
      owner: 'devops',
      confidence: 'high',
      reason: 'Error indicates environment or infrastructure issue.',
      nextAction: 'Check browser installation, network connectivity, and server availability.',
    };
  }

  // Data issues
  if (
    err.includes('safeToDelete') ||
    err.includes('forgeqa.test') && err.includes('invalid') ||
    err.includes('data') && err.includes('missing') ||
    err.includes('generated') && err.includes('invalid')
  ) {
    return {
      type: 'data_issue',
      owner: 'qa',
      confidence: 'medium',
      reason: 'Error suggests invalid or missing generated test data.',
      nextAction: 'Regenerate golden data and re-run.',
    };
  }

  // Missing selector in normal workflow
  if (
    err.includes('selector') && err.includes('not found') ||
    err.includes('locator') && err.includes('resolve') ||
    err.includes('element') && err.includes('not found') ||
    err.includes('strict mode') && err.includes('multiple')
  ) {
    if (expectedMissingSelectors) {
      return {
        type: 'expected_diagnostic_failure',
        owner: 'qa',
        confidence: 'high',
        reason: 'Missing selector was expected for this diagnostic template.',
        nextAction: 'No action needed; validates detector.',
      };
    }
    return {
      type: 'app_bug',
      owner: 'frontend',
      confidence: 'medium',
      reason: 'Element selector could not be found. The app DOM may have changed.',
      nextAction: 'Inspect the page structure and update selectors or fix the app.',
    };
  }

  // Navigation / URL issues
  if (
    err.includes('navigation') && err.includes('blocked') ||
    err.includes('external url') && err.includes('blocked') ||
    err.includes('unsafe protocol')
  ) {
    return {
      type: 'policy_block',
      owner: 'security',
      confidence: 'high',
      reason: 'Navigation or URL was blocked by safety policy.',
      nextAction: 'Review URL policy or use approved demo routes.',
    };
  }

  // Form / assertion failures
  if (
    err.includes('expected text') ||
    err.includes('expected element') ||
    err.includes('visible') ||
    err.includes('hidden')
  ) {
    return {
      type: 'app_bug',
      owner: 'frontend',
      confidence: 'medium',
      reason: 'UI assertion failed. The app state did not match expectations.',
      nextAction: 'Check UI state, loading behavior, and conditional rendering.',
    };
  }

  // Upload failures
  if (stepAction === 'upload' && err.includes('file')) {
    return {
      type: 'test_bug',
      owner: 'qa',
      confidence: 'medium',
      reason: 'File upload step failed. Test fixture or path may be incorrect.',
      nextAction: 'Verify test file fixture and upload input selector.',
    };
  }

  // Product gap
  if (
    err.includes('unimplemented') ||
    err.includes('not supported') ||
    err.includes('feature') && err.includes('disabled')
  ) {
    return {
      type: 'product_gap',
      owner: 'product',
      confidence: 'medium',
      reason: 'The tested feature appears unimplemented or disabled.',
      nextAction: 'Check product roadmap and feature flags.',
    };
  }

  // Fallback
  return {
    type: 'unknown_needs_human_review',
    owner: 'human_review',
    confidence: 'low',
    reason: `Unrecognized failure pattern: ${error.slice(0, 200)}`,
    nextAction: 'Investigate manually using screenshots and trace.',
  };
}

export function classifyFailures(
  template: WorkflowTemplate,
  plan: WorkflowPlan,
  manifest: RunManifest,
): FailureClassificationReport {
  const classifications: FailureClassification[] = [];

  for (const step of plan.steps) {
    const result = manifest.steps.find((s: StepResult) => s.stepId === step.id);
    if (!result || result.status !== 'failed') continue;

    const isPolicyBlocked = manifest.policyDecisions?.some(
      (d) => d.stepId === step.id && d.riskLevel === 'blocked',
    ) ?? false;

    const classification = classifyError(
      result.error ?? 'unknown error',
      step.action,
      step.target,
      template.category,
      isPolicyBlocked,
      template.expectedMissingSelectors,
    );

    classifications.push({
      stepId: step.id,
      stepIndex: step.order,
      failureType: classification.type,
      confidence: classification.confidence,
      reason: classification.reason,
      evidence: result.error ?? 'No error message',
      suggestedOwner: classification.owner,
      recommendedNextAction: classification.nextAction,
    });
  }

  const summary = {
    totalFailedSteps: classifications.length,
    appBugCount: classifications.filter((c) => c.failureType === 'app_bug').length,
    testBugCount: classifications.filter((c) => c.failureType === 'test_bug').length,
    environmentIssueCount: classifications.filter((c) => c.failureType === 'environment_issue').length,
    dataIssueCount: classifications.filter((c) => c.failureType === 'data_issue').length,
    policyBlockCount: classifications.filter((c) => c.failureType === 'policy_block').length,
    expectedDiagnosticCount: classifications.filter((c) => c.failureType === 'expected_diagnostic_failure').length,
    productGapCount: classifications.filter((c) => c.failureType === 'product_gap').length,
    unknownCount: classifications.filter((c) => c.failureType === 'unknown_needs_human_review').length,
  };

  return {
    runId: manifest.runId,
    templateId: template.id,
    classifications,
    summary,
  };
}

export function generateFailureClassificationMarkdown(report: FailureClassificationReport): string {
  const lines: string[] = [];
  lines.push('# ForgeQA Failure Classification');
  lines.push('');
  lines.push(`- **Run ID:** \`${report.runId}\``);
  lines.push(`- **Template:** ${report.templateId}`);
  lines.push('');

  if (report.classifications.length === 0) {
    lines.push('> No failed steps required classification.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('## Summary');
  lines.push('');
  lines.push(`| Type | Count |`);
  lines.push(`|------|-------|`);
  lines.push(`| App Bug | ${report.summary.appBugCount} |`);
  lines.push(`| Test Bug | ${report.summary.testBugCount} |`);
  lines.push(`| Environment Issue | ${report.summary.environmentIssueCount} |`);
  lines.push(`| Data Issue | ${report.summary.dataIssueCount} |`);
  lines.push(`| Policy Block | ${report.summary.policyBlockCount} |`);
  lines.push(`| Expected Diagnostic | ${report.summary.expectedDiagnosticCount} |`);
  lines.push(`| Product Gap | ${report.summary.productGapCount} |`);
  lines.push(`| Unknown / Needs Review | ${report.summary.unknownCount} |`);
  lines.push('');

  lines.push('## Classifications');
  lines.push('');
  for (const c of report.classifications) {
    lines.push(`### Step ${c.stepId} (Index ${c.stepIndex})`);
    lines.push(`- **Failure Type:** ${c.failureType}`);
    lines.push(`- **Confidence:** ${c.confidence}`);
    lines.push(`- **Suggested Owner:** ${c.suggestedOwner}`);
    lines.push(`- **Reason:** ${c.reason}`);
    lines.push(`- **Evidence:** ${c.evidence}`);
    lines.push(`- **Next Action:** ${c.recommendedNextAction}`);
    lines.push('');
  }

  return lines.join('\n');
}
