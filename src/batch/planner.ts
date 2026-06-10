import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { matchPrompt } from '../templates/registry.js';
import type { BatchPlan, BatchItem, BatchOptions, BatchResult } from './types.js';
import { getIndustryPackById, recommendIndustryPacks } from '../industry/registry.js';

export function createBatchPlan(prompts: string[], options: BatchOptions): BatchPlan {
  const batchId = nanoid();
  const createdAt = new Date().toISOString();
  const resolved: BatchItem[] = [];
  const skipped: BatchPlan['skippedPrompts'] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  // Industry pack handling
  let industryPackId: string | undefined;
  let industryPackName: string | undefined;
  let industryRecommendations: BatchPlan['industryRecommendations'] | undefined;
  let industryMapping: BatchPlan['industryMapping'] | undefined;

  if (options.industry) {
    const pack = getIndustryPackById(options.industry);
    if (pack) {
      industryPackId = pack.id;
      industryPackName = pack.name;
    } else {
      warnings.push(`Industry pack "${options.industry}" not found.`);
    }
  }

  if (options.recommendIndustry && !options.industry) {
    const recs = recommendIndustryPacks();
    industryRecommendations = recs.slice(0, 3).map((r) => ({
      packId: r.packId,
      packName: r.packName,
      confidence: r.confidence,
      reason: r.reason,
    }));
  }

  for (const prompt of prompts) {
    const match = matchPrompt(prompt);

    if (!match.matched) {
      skipped.push({
        prompt,
        reason: 'No matching template found',
        suggestions: match.suggestions,
      });
      continue;
    }

    const template = match.template;
    const isDiagnostic = template.id.startsWith('diagnostic.');
    const isPolicy = template.category === 'policy' || template.riskLevel === 'high' || template.destructiveAction;
    const isExternal = options.mode === 'external';

    // Check if diagnostic requires flag
    if (isDiagnostic && !options.includeDiagnostics) {
      skipped.push({
        prompt,
        reason: 'Diagnostic template requires --include-diagnostics',
        suggestions: ['Run with --include-diagnostics flag'],
      });
      warnings.push(`Prompt "${prompt}" matched diagnostic template "${template.id}" but --include-diagnostics was not set.`);
      continue;
    }

    // Check if policy template requires flag
    if (isPolicy && !options.includePolicy) {
      skipped.push({
        prompt,
        reason: 'Policy scenario requires --include-policy',
        suggestions: ['Run with --include-policy flag'],
      });
      warnings.push(`Prompt "${prompt}" matched policy template "${template.id}" but --include-policy was not set.`);
      continue;
    }

    // Check if template supports the requested mode
    if (isExternal && !template.supportedModes.includes('external')) {
      skipped.push({
        prompt,
        reason: `Template "${template.id}" does not support external mode`,
      });
      continue;
    }

    const expectedRisk = template.destructiveAction ? 'high' :
      template.mutationRisk === 'high' ? 'high' :
      template.mutationRisk === 'medium' ? 'medium' : 'low';

    const requiresApproval = isExternal || template.requiresHumanApproval || template.destructiveAction;

    const item: BatchItem = {
      itemId: nanoid(),
      prompt,
      templateId: template.id,
      templateName: template.name,
      mode: options.mode,
      viewport: options.viewport || template.defaultViewport || 'desktop',
      baseUrl: options.baseUrl,
      expectedRisk,
      requiresApproval,
      status: 'planned',
    };

    resolved.push(item);
  }

  const approvedCount = resolved.filter((i) => !i.requiresApproval).length;
  const cautionCount = resolved.filter((i) => i.requiresApproval && i.expectedRisk !== 'high').length;
  const blockedCount = resolved.filter((i) => i.requiresApproval && i.expectedRisk === 'high').length;

  // Build industry mapping if pack selected
  if (industryPackId && industryPackName) {
    const pack = getIndustryPackById(industryPackId);
    if (pack) {
      const executedTemplateIds = new Set(resolved.map((i) => i.templateId));
      const requiredItemsCovered: string[] = [];
      const requiredItemsMissing: string[] = [];
      const recommendedItemsCovered: string[] = [];
      const recommendedItemsMissing: string[] = [];

      for (const rec of pack.recommendedTemplates) {
        if (rec.priority === 'required') {
          if (executedTemplateIds.has(rec.templateId)) {
            requiredItemsCovered.push(rec.templateId);
          } else {
            requiredItemsMissing.push(rec.templateId);
          }
        } else {
          if (executedTemplateIds.has(rec.templateId)) {
            recommendedItemsCovered.push(rec.templateId);
          } else {
            recommendedItemsMissing.push(rec.templateId);
          }
        }
      }

      industryMapping = {
        requiredItemsCovered,
        requiredItemsMissing,
        recommendedItemsCovered,
        recommendedItemsMissing,
        blockedTemplates: pack.blockedTemplates,
        caveats: pack.caveats,
      };

      if (requiredItemsMissing.length > 0) {
        warnings.push(`Industry pack "${pack.name}" is missing required templates: ${requiredItemsMissing.join(', ')}`);
      }
    }
  }

  return {
    batchId,
    createdAt,
    mode: options.mode,
    requestedPrompts: prompts,
    resolvedTemplates: resolved,
    skippedPrompts: skipped,
    executionOrder: resolved.map((i) => i.itemId),
    policySummary: {
      totalItems: resolved.length,
      approvedItems: approvedCount,
      cautionItems: cautionCount,
      blockedItems: blockedCount,
      skippedItems: skipped.length,
    },
    estimatedRunCount: resolved.length,
    warnings,
    errors,
    industryPackId,
    industryPackName,
    industryRecommendations,
    industryMapping,
  };
}

export function generateBatchPlanMarkdown(plan: BatchPlan): string {
  const lines: string[] = [];
  lines.push('# ForgeQA Batch Plan');
  lines.push('');
  lines.push(`- **Batch ID:** \`${plan.batchId}\``);
  lines.push(`- **Created At:** ${plan.createdAt}`);
  lines.push(`- **Mode:** ${plan.mode}`);
  lines.push(`- **Estimated Runs:** ${plan.estimatedRunCount}`);
  lines.push('');

  lines.push('## Policy Summary');
  lines.push(`- Total Items: ${plan.policySummary.totalItems}`);
  lines.push(`- Approved: ${plan.policySummary.approvedItems}`);
  lines.push(`- Caution: ${plan.policySummary.cautionItems}`);
  lines.push(`- Blocked: ${plan.policySummary.blockedItems}`);
  lines.push(`- Skipped: ${plan.policySummary.skippedItems}`);
  lines.push('');

  if (plan.resolvedTemplates.length > 0) {
    lines.push('## Resolved Items');
    for (const item of plan.resolvedTemplates) {
      lines.push(`### ${item.prompt}`);
      lines.push(`- Template: ${item.templateName} (${item.templateId})`);
      lines.push(`- Mode: ${item.mode}`);
      lines.push(`- Viewport: ${item.viewport}`);
      lines.push(`- Expected Risk: ${item.expectedRisk}`);
      lines.push(`- Requires Approval: ${item.requiresApproval ? 'yes' : 'no'}`);
      lines.push(`- Status: ${item.status}`);
      lines.push('');
    }
  }

  if (plan.skippedPrompts.length > 0) {
    lines.push('## Skipped Prompts');
    for (const s of plan.skippedPrompts) {
      lines.push(`- **${s.prompt}**: ${s.reason}`);
      if (s.suggestions) {
        lines.push(`  Suggestions: ${s.suggestions.join(', ')}`);
      }
    }
    lines.push('');
  }

  if (plan.warnings.length > 0) {
    lines.push('## Warnings');
    for (const w of plan.warnings) {
      lines.push(`- ${w}`);
    }
    lines.push('');
  }

  if (plan.industryPackId && plan.industryPackName) {
    lines.push('## Industry Readiness Pack');
    lines.push('');
    lines.push(`- **Pack:** ${plan.industryPackName} (\`${plan.industryPackId}\`)`);
    if (plan.industryMapping) {
      lines.push(`- **Required Items Covered:** ${plan.industryMapping.requiredItemsCovered.length}`);
      lines.push(`- **Required Items Missing:** ${plan.industryMapping.requiredItemsMissing.length}`);
      lines.push(`- **Recommended Items Covered:** ${plan.industryMapping.recommendedItemsCovered.length}`);
      lines.push(`- **Recommended Items Missing:** ${plan.industryMapping.recommendedItemsMissing.length}`);
      if (plan.industryMapping.blockedTemplates.length > 0) {
        lines.push(`- **Blocked Templates:** ${plan.industryMapping.blockedTemplates.join(', ')}`);
      }
      if (plan.industryMapping.requiredItemsMissing.length > 0) {
        lines.push('');
        lines.push('### Missing Required Templates');
        for (const tid of plan.industryMapping.requiredItemsMissing) {
          lines.push(`- ${tid}`);
        }
      }
      if (plan.industryMapping.recommendedItemsMissing.length > 0) {
        lines.push('');
        lines.push('### Missing Recommended Templates');
        for (const tid of plan.industryMapping.recommendedItemsMissing) {
          lines.push(`- ${tid}`);
        }
      }
      lines.push('');
      lines.push('### Caveats');
      for (const c of plan.industryMapping.caveats) {
        lines.push(`- ${c}`);
      }
    }
    lines.push('');
  }

  if (plan.industryRecommendations && plan.industryRecommendations.length > 0) {
    lines.push('## Suggested Industry Packs');
    lines.push('');
    for (const r of plan.industryRecommendations) {
      lines.push(`- **${r.packName}** (${Math.round(r.confidence * 100)}% confidence) — ${r.reason}`);
    }
    lines.push('');
  }

  lines.push('## Safety Disclaimer');
  lines.push('This is a batch plan only. No browser execution has occurred. All items will be executed sequentially with independent generated data.');

  return lines.join('\n');
}

export function generateBatchResultMarkdown(result: BatchResult) {
  const lines: string[] = [];
  lines.push('# ForgeQA Batch Run Summary');
  lines.push('');
  lines.push(`- **Batch ID:** \`${result.batchId}\``);
  lines.push(`- **Status:** ${result.status}`);
  lines.push(`- **Started At:** ${result.startedAt}`);
  lines.push(`- **Completed At:** ${result.completedAt}`);
  lines.push('');

  lines.push('## Executive Summary');
  lines.push(`- Total Items: ${result.items.length}`);
  lines.push(`- Passed: ${result.passCount}`);
  lines.push(`- Failed: ${result.failCount}`);
  lines.push(`- Blocked: ${result.blockedCount}`);
  lines.push(`- Skipped: ${result.skippedCount}`);
  lines.push('');

  lines.push('## Batch Items');
  for (const item of result.items) {
    lines.push(`### ${item.prompt}`);
    lines.push(`- Template: ${item.templateName}`);
    lines.push(`- Run ID: ${item.runId ?? 'N/A'}`);
    lines.push(`- Status: ${item.status}`);
    if (item.verdict) lines.push(`- Verdict: ${item.verdict}`);
    if (item.reportHealth) lines.push(`- Report Health: ${item.reportHealth}`);
    if (item.error) lines.push(`- Error: ${item.error}`);
    lines.push('');
  }

  if (result.scopeSummary) {
    lines.push('## Scope Summary');
    lines.push(`- Total Tested: ${result.scopeSummary.totalTested}`);
    lines.push(`- Total Not Tested: ${result.scopeSummary.totalNotTested}`);
    lines.push(`- Needs Human Review: ${result.scopeSummary.totalNeedsHumanReview}`);
    lines.push(`- Average Coverage: ${result.scopeSummary.totalCoveragePercent}%`);
    lines.push('');
  }

  if (result.failureSummary) {
    lines.push('## Failure Type Breakdown');
    lines.push(`| Type | Count |`);
    lines.push(`|------|-------|`);
    lines.push(`| App Bug | ${result.failureSummary.appBugCount} |`);
    lines.push(`| Test Bug | ${result.failureSummary.testBugCount} |`);
    lines.push(`| Environment Issue | ${result.failureSummary.environmentIssueCount} |`);
    lines.push(`| Data Issue | ${result.failureSummary.dataIssueCount} |`);
    lines.push(`| Policy Block | ${result.failureSummary.policyBlockCount} |`);
    lines.push(`| Expected Diagnostic | ${result.failureSummary.expectedDiagnosticCount} |`);
    lines.push(`| Product Gap | ${result.failureSummary.productGapCount} |`);
    lines.push(`| Unknown | ${result.failureSummary.unknownCount} |`);
    lines.push('');
  }

  if (result.galleryLinks && Object.keys(result.galleryLinks).length > 0) {
    lines.push('## Evidence Gallery Links');
    for (const [runId, link] of Object.entries(result.galleryLinks)) {
      lines.push(`- \`${runId}\`: ${link}`);
    }
    lines.push('');
  }

  if (result.industryAssessment) {
    lines.push('## Industry Readiness Summary');
    lines.push('');
    lines.push(`- **Pack:** ${result.industryPackName} (\`${result.industryPackId}\`)`);
    lines.push(`- **Status:** ${result.industryAssessment.status}`);
    lines.push(`- **Score:** ${result.industryAssessment.score}/100`);
    lines.push(`- **Required Coverage:** ${Math.round(result.industryAssessment.requiredCoverage * 100)}%`);
    lines.push('');

    if (result.industryAssessment.requiredItemsTested.length > 0) {
      lines.push('### Required Items Tested');
      for (const item of result.industryAssessment.requiredItemsTested) {
        lines.push(`- ${item}`);
      }
      lines.push('');
    }

    if (result.industryAssessment.requiredItemsMissing.length > 0) {
      lines.push('### Required Items Not Tested');
      for (const item of result.industryAssessment.requiredItemsMissing) {
        lines.push(`- ${item}`);
      }
      lines.push('');
    }

    if (result.industryAssessment.recommendedItemsMissing.length > 0) {
      lines.push('### Recommended Next Templates');
      for (const item of result.industryAssessment.recommendedItemsMissing) {
        lines.push(`- ${item}`);
      }
      lines.push('');
    }

    if (result.industryAssessment.blockedByPolicyItems.length > 0) {
      lines.push('### Blocked by Policy');
      for (const item of result.industryAssessment.blockedByPolicyItems) {
        lines.push(`- **${item.label}** — ${item.reason}`);
      }
      lines.push('');
    }

    if (result.industryAssessment.warnings.length > 0) {
      lines.push('### Warnings');
      for (const w of result.industryAssessment.warnings) {
        lines.push(`- ${w}`);
      }
      lines.push('');
    }

    if (result.industryAssessment.recommendations.length > 0) {
      lines.push('### Recommendations');
      for (const r of result.industryAssessment.recommendations) {
        lines.push(`- ${r}`);
      }
      lines.push('');
    }

    lines.push('### Caveats / Disclaimer');
    for (const c of result.industryAssessment.caveats) {
      lines.push(`- ${c}`);
    }
    lines.push('');
    lines.push(`> ${result.industryAssessment.disclaimer}`);
    lines.push('');
  }

  // Batch Validation Summary (populated if validation exists)
  const batchDir = path.join(process.cwd(), 'artifacts', 'batches', result.batchId);
  const validationPath = path.join(batchDir, 'batch-validation.json');
  if (fs.existsSync(validationPath)) {
    try {
      const validation = JSON.parse(fs.readFileSync(validationPath, 'utf-8'));
      lines.push('## Batch Validation Summary');
      lines.push('');
      lines.push(`- **Status:** ${validation.status.toUpperCase()}`);
      lines.push(`- **Total Checks:** ${validation.summary.totalChecks}`);
      lines.push(`- **Passed:** ${validation.summary.passCount}`);
      lines.push(`- **Warnings:** ${validation.summary.warnCount}`);
      lines.push(`- **Failures:** ${validation.summary.failCount}`);
      lines.push(`- **Missing Files:** ${validation.summary.missingFiles.length}`);
      lines.push(`- **Broken Links:** ${validation.summary.brokenLinks.length}`);
      lines.push(`- **Portability Findings:** ${validation.summary.absolutePathFindings.length}`);
      lines.push(`- **Disclaimer Findings:** ${validation.summary.missingDisclaimerFindings.length}`);
      lines.push(`- **Linked Run Failures:** ${validation.summary.linkedRunFailures.length}`);
      lines.push('');
      lines.push(`> Full validation report: batch-validation.md`);
      lines.push('');
    } catch { /* ignore */ }
  }

  lines.push('## Next Actions');
  lines.push('Review individual run reports for detailed findings and screenshots.');

  return lines.join('\n');
}
