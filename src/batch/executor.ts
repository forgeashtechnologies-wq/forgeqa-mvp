import path from 'node:path';
import fs from 'node:fs';
import { runWorkflow } from '../cli/run-workflow.js';
import { getRunDir } from '../artifacts/manager.js';
import type { BatchPlan, BatchItem, BatchResult, BatchOptions } from './types.js';
import type { RunWorkflowOptions } from '../cli/run-workflow.js';
import { getIndustryPackById } from '../industry/registry.js';
import { assessBatchAgainstIndustryPack, generateBatchIndustryAssessmentMarkdown, generateBatchIndustryAssessmentJson } from '../industry/batch-assessor.js';
import { validateBatchArtifacts, generateBatchValidationMarkdown, generateBatchValidationJson } from './validator.js';
import { generateBatchManifest, generateBatchManifestJson } from './manifest.js';

export async function executeBatchPlan(
  plan: BatchPlan,
  options: BatchOptions,
): Promise<BatchResult> {
  const startedAt = new Date().toISOString();
  const items: BatchItem[] = [];
  const runIds: string[] = [];
  let passCount = 0;
  let failCount = 0;
  let blockedCount = 0;
  let skippedCount = 0;

  const batchDir = path.join(process.cwd(), 'artifacts', 'batches', plan.batchId);
  fs.mkdirSync(batchDir, { recursive: true });

  for (const item of plan.resolvedTemplates) {
    const updatedItem: BatchItem = { ...item, status: 'running' };

    try {
      // Approval checks before execution
      if (item.requiresApproval && item.mode === 'external' && !options.approveExternal) {
        updatedItem.status = 'blocked';
        updatedItem.error = 'External run requires --approve-external';
        blockedCount++;
        items.push(updatedItem);
        continue;
      }

      if (item.requiresApproval && options.mode === 'external' && !options.approveRisk) {
        updatedItem.status = 'blocked';
        updatedItem.error = 'External run requires --approve-risk with a reason';
        blockedCount++;
        items.push(updatedItem);
        continue;
      }

      const runOpts: RunWorkflowOptions = {
        demo: item.mode === 'demo',
        external: item.mode === 'external',
        baseUrl: item.baseUrl || '',
        allowHost: [],
        dryRunPlan: false,
        policyPreview: false,
        viewport: item.viewport,
        mobile: item.viewport === 'mobile',
        allowSubmit: false,
        allowUpload: false,
        approveRisk: options.approveRisk || '',
        strictPolicy: options.strictPolicy,
        industry: options.industry,
        recommendIndustry: options.recommendIndustry,
        json: true,
        quiet: true,
        verbose: false,
      };

      const result = await runWorkflow(item.prompt, runOpts);
      updatedItem.runId = result.runId;
      updatedItem.status = result.status === 'completed' || result.status === 'dry-run' ? 'completed' : 'failed';
      updatedItem.verdict = result.verdict;
      updatedItem.reportHealth = result.reportHealth;
      runIds.push(result.runId);

      if (result.status === 'completed' && result.verdict === 'ready_for_demo') {
        passCount++;
      } else if (result.status === 'failed') {
        failCount++;
      }
    } catch (err) {
      updatedItem.status = 'failed';
      updatedItem.error = (err as Error).message;
      failCount++;
    }

    items.push(updatedItem);
  }

  skippedCount += plan.skippedPrompts.length;

  const completedAt = new Date().toISOString();
  const status: BatchResult['status'] = failCount > 0 ? 'completed_with_failures' : 'completed';

  // Read report health and new artifacts from each run
  const reportHealthSummary: Record<string, string> = {};
  const dataSafetySummary: Record<string, string> = {};
  let totalTested = 0;
  let totalNotTested = 0;
  let totalNeedsHumanReview = 0;
  let totalCoveragePercent = 0;
  const failureCounts = {
    appBugCount: 0,
    testBugCount: 0,
    environmentIssueCount: 0,
    dataIssueCount: 0,
    policyBlockCount: 0,
    expectedDiagnosticCount: 0,
    productGapCount: 0,
    unknownCount: 0,
  };
  const galleryLinks: Record<string, string> = {};

  for (const runId of runIds) {
    const runDir = getRunDir(runId);
    try {
      const validation = JSON.parse(fs.readFileSync(path.join(runDir, 'artifact-validation.json'), 'utf-8'));
      reportHealthSummary[runId] = validation.isValid ? 'pass' : 'fail';
    } catch {
      reportHealthSummary[runId] = 'unknown';
    }
    try {
      const audit = JSON.parse(fs.readFileSync(path.join(runDir, 'data-safety-audit.json'), 'utf-8'));
      dataSafetySummary[runId] = audit.status ?? 'unknown';
    } catch {
      dataSafetySummary[runId] = 'unknown';
    }

    try {
      const scopeAnalysis = JSON.parse(fs.readFileSync(path.join(runDir, 'scope-analysis.json'), 'utf-8'));
      totalTested += scopeAnalysis.summary?.testedCount ?? 0;
      totalNotTested += scopeAnalysis.summary?.notTestedCount ?? 0;
      totalNeedsHumanReview += scopeAnalysis.summary?.needsHumanReviewCount ?? 0;
      totalCoveragePercent += scopeAnalysis.summary?.coveragePercent ?? 0;
    } catch { /* ignore */ }

    try {
      const failureReport = JSON.parse(fs.readFileSync(path.join(runDir, 'failure-classification.json'), 'utf-8'));
      failureCounts.appBugCount += failureReport.summary?.appBugCount ?? 0;
      failureCounts.testBugCount += failureReport.summary?.testBugCount ?? 0;
      failureCounts.environmentIssueCount += failureReport.summary?.environmentIssueCount ?? 0;
      failureCounts.dataIssueCount += failureReport.summary?.dataIssueCount ?? 0;
      failureCounts.policyBlockCount += failureReport.summary?.policyBlockCount ?? 0;
      failureCounts.expectedDiagnosticCount += failureReport.summary?.expectedDiagnosticCount ?? 0;
      failureCounts.productGapCount += failureReport.summary?.productGapCount ?? 0;
      failureCounts.unknownCount += failureReport.summary?.unknownCount ?? 0;
    } catch { /* ignore */ }

    galleryLinks[runId] = `artifacts/runs/${runId}/screenshot-gallery.html`;
  }

  const runCount = runIds.length || 1;

  // Generate batch industry assessment if --industry was used
  let industryAssessment: BatchResult['industryAssessment'] | undefined;
  if (options.industry) {
    const pack = getIndustryPackById(options.industry);
    if (pack) {
      const batchResult: BatchResult = {
        batchId: plan.batchId,
        status,
        startedAt,
        completedAt,
        items,
        runIds,
        passCount,
        failCount,
        blockedCount,
        skippedCount,
        reportHealthSummary,
        dataSafetySummary,
        policySummary: {
          totalItems: items.length,
          passed: passCount,
          failed: failCount,
          blocked: blockedCount,
          skipped: skippedCount,
        },
        artifactPath: `artifacts/batches/${plan.batchId}`,
        scopeSummary: {
          totalTested,
          totalNotTested,
          totalNeedsHumanReview,
          totalCoveragePercent: Math.round(totalCoveragePercent / runCount),
        },
        failureSummary: failureCounts,
        galleryLinks,
      };

      const batchIndustryAssessment = assessBatchAgainstIndustryPack(batchResult, pack);
      const industryMd = generateBatchIndustryAssessmentMarkdown(batchIndustryAssessment);
      const industryJson = generateBatchIndustryAssessmentJson(batchIndustryAssessment);

      fs.writeFileSync(path.join(batchDir, 'industry-batch-assessment.md'), industryMd, 'utf-8');
      fs.writeFileSync(path.join(batchDir, 'industry-batch-assessment.json'), industryJson, 'utf-8');

      industryAssessment = {
        status: batchIndustryAssessment.status,
        score: batchIndustryAssessment.score,
        requiredCoverage: batchIndustryAssessment.aggregatedCoverage,
        requiredItemsTested: batchIndustryAssessment.requiredItemsTested,
        requiredItemsMissing: batchIndustryAssessment.requiredItemsMissing,
        recommendedItemsTested: batchIndustryAssessment.recommendedItemsTested,
        recommendedItemsMissing: batchIndustryAssessment.recommendedItemsMissing,
        notTestedItems: batchIndustryAssessment.notTestedItems,
        blockedByPolicyItems: batchIndustryAssessment.blockedByPolicyItems,
        warnings: batchIndustryAssessment.warnings,
        recommendations: batchIndustryAssessment.recommendations,
        caveats: batchIndustryAssessment.caveats,
        disclaimer: batchIndustryAssessment.disclaimer,
      };
    }
  }

  const batchResult: BatchResult = {
    batchId: plan.batchId,
    status,
    startedAt,
    completedAt,
    items,
    runIds,
    passCount,
    failCount,
    blockedCount,
    skippedCount,
    reportHealthSummary,
    dataSafetySummary,
    policySummary: {
      totalItems: items.length,
      passed: passCount,
      failed: failCount,
      blocked: blockedCount,
      skipped: skippedCount,
    },
    artifactPath: `artifacts/batches/${plan.batchId}`,
    scopeSummary: {
      totalTested,
      totalNotTested,
      totalNeedsHumanReview,
      totalCoveragePercent: Math.round(totalCoveragePercent / runCount),
    },
    failureSummary: failureCounts,
    galleryLinks,
    industryPackId: options.industry,
    industryPackName: options.industry ? getIndustryPackById(options.industry)?.name : undefined,
    industryAssessment,
  };

  // Generate batch manifest
  const manifest = generateBatchManifest(batchResult);

  // Run batch validation
  const validation = validateBatchArtifacts(plan.batchId);
  manifest.validationStatus = validation.status;

  // Write manifest, validation artifacts
  fs.writeFileSync(path.join(batchDir, 'batch-manifest.json'), generateBatchManifestJson(manifest), 'utf-8');
  fs.writeFileSync(path.join(batchDir, 'batch-validation.json'), generateBatchValidationJson(validation), 'utf-8');
  fs.writeFileSync(path.join(batchDir, 'batch-validation.md'), generateBatchValidationMarkdown(validation), 'utf-8');

  return batchResult;
}

export function summarizeBatchResult(result: BatchResult): string {
  const lines: string[] = [];
  lines.push(`Batch ${result.batchId}: ${result.status}`);
  lines.push(`Items: ${result.items.length}, Pass: ${result.passCount}, Fail: ${result.failCount}, Blocked: ${result.blockedCount}, Skipped: ${result.skippedCount}`);
  for (const item of result.items) {
    const indicator = item.status === 'completed' ? 'OK' : item.status === 'failed' ? 'FAIL' : item.status === 'blocked' ? 'BLOCK' : 'SKIP';
    lines.push(`  [${indicator}] ${item.prompt} (${item.runId ?? 'no runId'})`);
  }
  return lines.join('\n');
}
