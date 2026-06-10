#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { listTemplates, listDiagnosticTemplates, searchTemplates } from './templates/registry.js';
import { listIndustryPacks } from './industry/registry.js';
import {
  createRunArtifactsDir,
  listRunDirs,
  getRunDir,
} from './artifacts/manager.js';
import { computeReadinessVerdict } from './report/markdown.js';
import { validateRunArtifacts } from './artifacts/validator.js';
import {
  listRunSummaries,
  readRunSummary,
  getRunShortId,
  formatRunTimestamp,
  computeRunHistoryStats,
} from './runs/history.js';
import {
  compareRuns,
  generateComparisonMarkdown,
  generateComparisonJson,
} from './runs/compare.js';
import {
  generateNewRunContextFromRun,
} from './runs/rerun.js';
import {
  openRunArtifact,
  type OpenOptions,
} from './runs/open.js';
import {
  loadForgeQAConfig,
  getConfigSourceSummary,
  writeProjectConfig,
  type ForgeQAConfig,
} from './config/config.js';
import { resolveForgeQAPaths } from './config/paths.js';
import { runWorkflow, type RunWorkflowOptions } from './cli/run-workflow.js';
import type { RunManifest } from './schemas/core.js';
import industryCli from './industry/cli.js';

const program = new Command();

program
  .name('forgeqa')
  .description('ForgeQA MVP — QA Proof OS for AI-built web apps')
  .version('0.1.0');

program
  .command('run <prompt>')
  .description('Run a QA workflow from a natural-language prompt')
  .option('--demo', 'Force demo mode (test domains, test prefixes, sandbox targets)', false)
  .option('--external', 'Run against an external target (requires --base-url)', false)
  .option('--base-url <url>', 'Base URL for external target', '')
  .option('--allow-host <host>', 'Allow additional host for external navigation (repeatable)', [])
  .option('--dry-run-plan', 'Generate preview plan without browser execution', false)
  .option('--policy-preview', 'Evaluate execution policy and write preview without browser execution', false)
  .option('--viewport <profile>', 'Device viewport profile (desktop|mobile|tablet|small-mobile)', 'desktop')
  .option('--mobile', 'Shortcut for --viewport mobile', false)
  .option('--allow-submit', 'Allow submit-like actions in external mode (requires --external)', false)
  .option('--allow-upload', 'Allow file upload actions in external mode (requires --external)', false)
  .option('--approve-risk <reason>', 'Human-approved risk reason for external mode', '')
  .option('--strict-policy', 'Treat caution-level actions as blocked', false)
  .option('--preflight-scan', 'Run testability scan before workflow execution', false)
  .option('--industry <packId>', 'Apply an industry readiness pack to the run', '')
  .option('--recommend-industry', 'Recommend industry packs based on run context', false)
  .option('--validate', 'Run artifact validation after completion', false)
  .option('--strict', 'Treat validation warnings as failures', false)
  .option('--json', 'Output machine-readable JSON summary', false)
  .option('--quiet', 'Print only runId and final status', false)
  .option('--verbose', 'Print detailed artifact list and finding counts', false)
  .action(async (prompt: string, options: RunWorkflowOptions) => {
    await runWorkflow(prompt, options);
  });

program
  .command('summary <runId>')
  .description('Show a summary of a completed run')
  .action((runId: string) => {
    const runDir = getRunDir(runId);
    if (!fs.existsSync(runDir)) {
      console.error(`Run not found: ${runId}`);
      process.exit(1);
    }

    const manifestPath = path.join(runDir, 'run.json');
    if (!fs.existsSync(manifestPath)) {
      console.error(`Manifest not found for run: ${runId}`);
      process.exit(1);
    }

    const manifest: RunManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const verdict = computeReadinessVerdict(manifest);
    const validation = validateRunArtifacts(runDir, manifest);
    const failCount = validation.checks.filter((c) => c.status === 'fail').length;
    const warnCount = validation.checks.filter((c) => c.status === 'warn').length;
    const healthStatus = failCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : 'pass';
    const screenshotCount = manifest.steps.filter((s) => s.screenshotPath).length;
    const hasTrace = fs.existsSync(path.join(runDir, 'trace.zip'));
    const patternFindings = (manifest as any).patternFindings?.length ?? 0;
    const domFindings = (manifest.domFindings ?? []).length;

    console.log(`Run ID:     ${manifest.runId}`);
    console.log(`Status:     ${manifest.status}`);
    console.log(`Verdict:    ${verdict}`);
    console.log(`Health:     ${healthStatus} (${validation.checks.length} checks, ${failCount} failures, ${warnCount} warnings)`);
    console.log(`Screenshots: ${screenshotCount}`);
    console.log(`Trace:      ${hasTrace ? 'yes' : 'no'}`);
    console.log(`Pattern:    ${patternFindings} finding(s)`);
    console.log(`DOM:        ${domFindings} finding(s)`);
    console.log(`Validation: ${validation.findings.length} finding(s)`);

    if (healthStatus === 'fail' || manifest.status === 'failed') {
      process.exit(1);
    }
  });

program
  .command('run-validate <runId>')
  .alias('run validate')
  .alias('validate-run')
  .description('Validate artifacts for a specific run')
  .option('--json', 'Output machine-readable JSON', false)
  .option('--strict', 'Treat warnings as failures', false)
  .option('--fix', 'Repair common low-risk portability issues', false)
  .option('--force-fix', 'Overwrite existing aliases during repair', false)
  .option('--output <path>', 'Write validation output to custom path', '')
  .option('--quiet', 'Print minimal output', false)
  .action(async (runId: string, options: { json: boolean; strict: boolean; fix: boolean; forceFix: boolean; output: string; quiet: boolean }) => {
    const runDir = getRunDir(runId);
    if (!fs.existsSync(runDir)) {
      console.error(`Run not found: ${runId}`);
      process.exit(1);
    }

    const manifestPath = path.join(runDir, 'run.json');
    if (!fs.existsSync(manifestPath)) {
      console.error(`Manifest not found for run: ${runId}`);
      process.exit(1);
    }

    const manifest: import('./schemas/core.js').RunManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    let validation = validateRunArtifacts(runDir, manifest);

    // Write/update artifact-validation artifacts
    fs.writeFileSync(path.join(runDir, 'artifact-validation.json'), JSON.stringify(validation, null, 2), 'utf-8');

    const mdLines: string[] = [];
    mdLines.push('# Artifact Validation Report');
    mdLines.push('');
    mdLines.push(`- **Run ID:** \`${runId}\``);
    mdLines.push(`- **Valid:** ${validation.isValid ? 'Yes' : 'No'}`);
    mdLines.push(`- **Checks:** ${validation.checks.length}`);
    const failCount = validation.checks.filter((c) => c.status === 'fail').length;
    const warnCount = validation.checks.filter((c) => c.status === 'warn').length;
    mdLines.push(`- **Failures:** ${failCount}`);
    mdLines.push(`- **Warnings:** ${warnCount}`);
    mdLines.push('');
    mdLines.push('## Checks');
    for (const check of validation.checks) {
      mdLines.push(`- **[${check.status.toUpperCase()}]** ${check.name}: ${check.message}`);
    }
    mdLines.push('');
    if (validation.findings.length > 0) {
      mdLines.push('## Findings');
      for (const f of validation.findings) {
        mdLines.push(`- **${f.severity.toUpperCase()}** ${f.patternId}: ${f.message}`);
      }
      mdLines.push('');
    }
    if (fs.existsSync(path.join(runDir, 'artifact-repair.json'))) {
      mdLines.push('## Repair Summary');
      mdLines.push('See [artifact-repair.md](artifact-repair.md) for repair details.');
      mdLines.push('');
    }
    mdLines.push('## Disclaimer');
    mdLines.push('This validation checks artifact completeness and report portability. It does not certify the app as secure, compliant, bug-free, or production-ready.');
    fs.writeFileSync(path.join(runDir, 'artifact-validation.md'), mdLines.join('\n'), 'utf-8');

    // Optional alias files
    fs.writeFileSync(path.join(runDir, 'run-validation.json'), JSON.stringify(validation, null, 2), 'utf-8');
    fs.writeFileSync(path.join(runDir, 'run-validation.md'), mdLines.join('\n'), 'utf-8');

    let repairResult: import('./artifacts/repair-types.js').RepairResult | undefined;
    if (options.fix) {
      const { repairRunArtifacts, writeRunRepairArtifacts } = await import('./artifacts/repair.js');
      repairResult = repairRunArtifacts(runId, { forceFix: options.forceFix });
      writeRunRepairArtifacts(repairResult);
      // Re-validate after repair
      validation = validateRunArtifacts(runDir, manifest);
      // Update validation artifacts after re-validation
      fs.writeFileSync(path.join(runDir, 'artifact-validation.json'), JSON.stringify(validation, null, 2), 'utf-8');
      fs.writeFileSync(path.join(runDir, 'run-validation.json'), JSON.stringify(validation, null, 2), 'utf-8');
    }

    if (options.output) {
      const outDir = path.dirname(options.output);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(options.output, JSON.stringify(validation, null, 2), 'utf-8');
    }

    const finalFailCount = validation.checks.filter((c) => c.status === 'fail').length;
    const finalWarnCount = validation.checks.filter((c) => c.status === 'warn').length;

    if (options.json) {
      const output: Record<string, unknown> = {
        runId,
        isValid: validation.isValid,
        status: finalFailCount > 0 ? 'fail' : finalWarnCount > 0 ? 'warn' : 'pass',
        checks: validation.checks.length,
        failures: finalFailCount,
        warnings: finalWarnCount,
        findings: validation.findings.length,
        artifactPath: `artifacts/runs/${runId}`,
      };
      if (repairResult) {
        output.repairStatus = repairResult.status;
        output.repairActions = repairResult.summary;
      }
      console.log(JSON.stringify(output, null, 2));
    } else if (!options.quiet) {
      console.log(`Run ${runId}: ${finalFailCount > 0 ? 'FAIL' : finalWarnCount > 0 ? 'WARN' : 'PASS'}`);
      console.log(`Checks: ${validation.checks.length}, Failures: ${finalFailCount}, Warnings: ${finalWarnCount}, Findings: ${validation.findings.length}`);
      if (repairResult) {
        console.log(`Repair: ${repairResult.status} (${repairResult.summary.fixedCount} fixed, ${repairResult.summary.manualReviewCount} manual review)`);
      }
      if (finalFailCount > 0) {
        for (const c of validation.checks.filter((c) => c.status === 'fail')) {
          console.log(`  [FAIL] ${c.name}: ${c.message}`);
        }
      }
    }

    const shouldFail = finalFailCount > 0 || (options.strict && finalWarnCount > 0);
    if (shouldFail) {
      process.exit(1);
    }
  });

program
  .command('repair-report <runId>')
  .alias('report-run')
  .description('Generate a unified repair + validation report for a run')
  .option('--json', 'Output machine-readable JSON', false)
  .option('--markdown', 'Output markdown to stdout', false)
  .option('--output <path>', 'Write output to custom path', '')
  .option('--quiet', 'Print minimal output', false)
  .action(async (runId: string, options: { json: boolean; markdown: boolean; output: string; quiet: boolean }) => {
    const { buildUnifiedRunReport, generateUnifiedRunReportMarkdown, generateUnifiedRunReportJson, writeUnifiedRunReport } = await import('./reports/unified-run-report.js');

    try {
      const report = buildUnifiedRunReport(runId);
      writeUnifiedRunReport(runId, report);

      if (options.output) {
        const outDir = path.dirname(options.output);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(options.output, generateUnifiedRunReportJson(report), 'utf-8');
      }

      if (options.json) {
        console.log(generateUnifiedRunReportJson(report));
      } else if (options.markdown) {
        console.log(generateUnifiedRunReportMarkdown(report));
      } else if (!options.quiet) {
        console.log(`Unified report for ${runId}: ${report.validation.status.toUpperCase()}`);
        console.log(`Findings: ${report.summary.totalFindings}, Repair actions: ${report.summary.totalRepairActions}, Manual review: ${report.summary.manualReviewItems}`);
        console.log(`Artifacts: artifacts/runs/${runId}/unified-report.md`);
        console.log(`JSON:     artifacts/runs/${runId}/unified-report.json`);
        if (report.recommendedNextSteps.length > 0) {
          console.log(`Next:     ${report.recommendedNextSteps[0]}`);
        }
      }
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ error: (err as Error).message }));
      } else {
        console.error((err as Error).message);
      }
      process.exit(1);
    }
  });

program
  .command('batch-report <batchId>')
  .alias('report-batch')
  .description('Generate a unified batch report')
  .option('--json', 'Output machine-readable JSON', false)
  .option('--markdown', 'Output markdown to stdout', false)
  .option('--output <path>', 'Write output to custom path', '')
  .option('--quiet', 'Print minimal output', false)
  .action(async (batchId: string, options: { json: boolean; markdown: boolean; output: string; quiet: boolean }) => {
    const { buildUnifiedBatchReport, generateUnifiedBatchReportMarkdown, generateUnifiedBatchReportJson, writeUnifiedBatchReport } = await import('./reports/batch-unified-report.js');

    try {
      const report = buildUnifiedBatchReport(batchId);
      writeUnifiedBatchReport(batchId, report);

      if (options.output) {
        const outDir = path.dirname(options.output);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(options.output, generateUnifiedBatchReportJson(report), 'utf-8');
      }

      if (options.json) {
        console.log(generateUnifiedBatchReportJson(report));
      } else if (options.markdown) {
        console.log(generateUnifiedBatchReportMarkdown(report));
      } else if (!options.quiet) {
        console.log(`Batch report ${batchId}: ${report.validation.status.toUpperCase()}`);
        if (report.result) {
          console.log(`Runs: ${report.result.totalRuns}, Completed: ${report.result.completedRuns}, Failed: ${report.result.failedRuns}`);
        } else {
          console.log('Preview-only batch');
        }
        console.log(`Findings: ${report.summary.totalFindings}, Repair actions: ${report.summary.totalRepairActions}, Manual review: ${report.summary.manualReviewItems}`);
        console.log(`Artifacts: artifacts/batches/${batchId}/batch-unified-report.md`);
        console.log(`JSON:     artifacts/batches/${batchId}/batch-unified-report.json`);
        if (report.recommendedNextSteps.length > 0) {
          console.log(`Next:     ${report.recommendedNextSteps[0]}`);
        }
      }
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ error: (err as Error).message }));
      } else {
        console.error((err as Error).message);
      }
      process.exit(1);
    }
  });

program
  .command('dashboard')
  .description('Generate a project-level overview dashboard')
  .option('--json', 'Output machine-readable JSON', false)
  .option('--markdown', 'Output markdown to stdout', false)
  .option('--output <path>', 'Write output to custom path', '')
  .option('--quiet', 'Print minimal output', false)
  .option('--limit <n>', 'Limit displayed runs/batches', '20')
  .action(async (options: { json: boolean; markdown: boolean; output: string; quiet: boolean; limit: string }) => {
    const { collectProjectDashboard } = await import('./dashboard/collector.js');
    const { generateProjectDashboardMarkdown, generateProjectDashboardJson, writeProjectDashboard } = await import('./dashboard/report.js');

    try {
      const dashboard = collectProjectDashboard({ limit: parseInt(options.limit, 10) });
      writeProjectDashboard(dashboard);

      if (options.output) {
        const outDir = path.dirname(options.output);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(options.output, generateProjectDashboardJson(dashboard), 'utf-8');
      }

      if (options.json) {
        console.log(generateProjectDashboardJson(dashboard));
      } else if (options.markdown) {
        console.log(generateProjectDashboardMarkdown(dashboard));
      } else if (!options.quiet) {
        console.log(`Dashboard: ${dashboard.status.toUpperCase()}`);
        console.log(`Health Score: ${dashboard.summary.overallHealthScore}/100`);
        console.log(`Runs: ${dashboard.summary.totalRuns} (${dashboard.summary.readyRunCount} ready, ${dashboard.summary.notReadyRunCount} not ready, ${dashboard.summary.failedRunCount} failed)`);
        console.log(`Batches: ${dashboard.summary.totalBatches}`);
        console.log(`Release Checks: ${dashboard.summary.totalReleaseChecks}`);
        console.log(`Artifacts: artifacts/dashboard/project-overview.md`);
        console.log(`JSON:     artifacts/dashboard/project-overview.json`);
        if (dashboard.recommendations.length > 0) {
          console.log(`Next:     ${dashboard.recommendations[0].message}`);
        }
      }
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ error: (err as Error).message }));
      } else {
        console.error((err as Error).message);
      }
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List recent runs')
  .action(() => {
    const runs = listRunDirs();
    if (runs.length === 0) {
      console.log('No runs found.');
      return;
    }

    console.log(`Found ${runs.length} run(s):`);
    console.log('');

    for (const runId of runs.slice(0, 20)) {
      const runDir = getRunDir(runId);
      const manifestPath = path.join(runDir, 'run.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest: RunManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const verdict = computeReadinessVerdict(manifest);
        const validation = validateRunArtifacts(runDir, manifest);
        const failCount = validation.checks.filter((c) => c.status === 'fail').length;
        const warnCount = validation.checks.filter((c) => c.status === 'warn').length;
        const healthStatus = failCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : 'pass';
        const screenshotCount = manifest.steps.filter((s) => s.screenshotPath).length;

        const statusIcon = manifest.status === 'failed' ? '❌' : manifest.status === 'completed' ? '✅' : '⏳';
        const healthIcon = healthStatus === 'pass' ? '' : healthStatus === 'warn' ? '⚠️' : '❌';

        console.log(`${statusIcon} ${runId} | ${manifest.status} | ${verdict} | health: ${healthStatus}${healthIcon} | screenshots: ${screenshotCount} | ${manifest.completedAt ?? manifest.startedAt}`);
      } catch {
        console.log(`? ${runId} | unknown`);
      }
    }
  });

program
  .command('templates')
  .description('List all available workflow templates')
  .option('--category <category>', 'Filter by category')
  .option('--mode <mode>', 'Filter by supported mode (demo, external, diagnostic)')
  .option('--search <keyword>', 'Search by keyword in id, name, description, tags')
  .option('--risk <level>', 'Filter by risk level (low, medium, high)')
  .option('--json', 'Output as JSON', false)
  .action((options: { category?: string; mode?: string; search?: string; risk?: string; json: boolean }) => {
    let templates = [...listTemplates()];
    if (options.category) {
      templates = templates.filter((t) => t.category === options.category);
    }
    if (options.mode) {
      templates = templates.filter((t) => t.supportedModes.includes(options.mode as 'demo' | 'external'));
    }
    if (options.search) {
      const kw = options.search.toLowerCase();
      templates = templates.filter((t) =>
        t.id.toLowerCase().includes(kw) ||
        t.name.toLowerCase().includes(kw) ||
        t.description.toLowerCase().includes(kw) ||
        t.tags.some((tag) => tag.toLowerCase().includes(kw)) ||
        t.matchers.some((m) => m.toLowerCase().includes(kw))
      );
    }
    if (options.risk) {
      templates = templates.filter((t) => t.riskLevel === options.risk);
    }

    if (options.json) {
      console.log(JSON.stringify(templates.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        difficulty: t.difficulty,
        tags: t.tags,
        supportedModes: t.supportedModes,
        riskLevel: t.riskLevel,
        mutationRisk: t.mutationRisk,
        defaultViewport: t.defaultViewport,
        requiresAuth: t.requiresAuth,
        requiresFileUpload: t.requiresFileUpload,
        demoRoutes: t.demoRoutes,
        stepCount: t.steps.length,
      })), null, 2));
      return;
    }

    console.log(`Available templates (${templates.length}):`);
    console.log('');
    for (const t of templates) {
      const modeStr = t.supportedModes.join(', ');
      const uploadStr = t.requiresFileUpload ? ' | upload' : '';
      const authStr = t.requiresAuth ? ' | auth' : '';
      const mutRisk = t.mutationRisk ? ` | mut:${t.mutationRisk}` : '';
      console.log(`${t.id}`);
      console.log(`  Name:  ${t.name}`);
      console.log(`  Diff:  ${t.difficulty}`);
      console.log(`  Cat:   ${t.category}`);
      console.log(`  Tags:  ${t.tags.join(', ')}`);
      console.log(`  Modes: ${modeStr}${authStr}${uploadStr}`);
      console.log(`  Risk:  ${t.riskLevel}${mutRisk}`);
      console.log(`  Steps: ${t.steps.length}`);
      console.log('');
    }
  });

program
  .command('diagnostics')
  .description('List all available diagnostic scenarios')
  .option('--json', 'Output as JSON', false)
  .action((options: { json: boolean }) => {
    const diagnostics = listDiagnosticTemplates();
    if (options.json) {
      console.log(JSON.stringify(diagnostics.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        difficulty: t.difficulty,
        tags: t.tags,
        demoRoutes: t.demoRoutes,
        stepCount: t.steps.length,
      })), null, 2));
      return;
    }

    console.log(`Available diagnostic scenarios (${diagnostics.length}):`);
    console.log('');
    for (const d of diagnostics) {
      console.log(`${d.id}`);
      console.log(`  Name:  ${d.name}`);
      console.log(`  Desc:  ${d.description}`);
      console.log(`  Route: ${d.demoRoutes[0] ?? 'N/A'}`);
      console.log(`  Steps: ${d.steps.length}`);
      console.log('');
    }
  });

program
  .command('search <keyword>')
  .description('Search templates by keyword')
  .option('--category <category>', 'Filter by category')
  .option('--mode <mode>', 'Filter by supported mode')
  .option('--risk <level>', 'Filter by risk level')
  .option('--include-diagnostics', 'Include diagnostic scenarios in search', false)
  .option('--limit <n>', 'Maximum results', '10')
  .option('--json', 'Output as JSON', false)
  .action((keyword: string, options: {
    category?: string;
    mode?: string;
    risk?: string;
    includeDiagnostics: boolean;
    limit: string;
    json: boolean;
  }) => {
    const isDiagnosticIntent = keyword.toLowerCase().includes('diagnostic');
    const isPolicyIntent = keyword.toLowerCase().includes('policy') || keyword.toLowerCase().includes('submit') || keyword.toLowerCase().includes('external') || keyword.toLowerCase().includes('safe');
    const includeDiagnostics = options.includeDiagnostics || isDiagnosticIntent;
    const includePolicy = isPolicyIntent;

    let results = searchTemplates(keyword, includeDiagnostics, includePolicy);

    if (options.category) {
      results = results.filter((r) => r.template.category === options.category);
    }
    if (options.mode) {
      results = results.filter((r) => r.template.supportedModes.includes(options.mode as 'demo' | 'external'));
    }
    if (options.risk) {
      results = results.filter((r) => r.template.riskLevel === options.risk);
    }

    const limit = parseInt(options.limit, 10);
    if (limit > 0) {
      results = results.slice(0, limit);
    }

    if (options.json) {
      console.log(JSON.stringify(results.map((r) => ({
        id: r.template.id,
        name: r.template.name,
        category: r.template.category,
        difficulty: r.template.difficulty,
        tags: r.template.tags,
        supportedModes: r.template.supportedModes,
        riskLevel: r.template.riskLevel,
        mutationRisk: r.template.mutationRisk,
        defaultViewport: r.template.defaultViewport,
        score: r.score,
        matchedFields: r.matchedFields,
      })), null, 2));
      return;
    }

    if (results.length === 0) {
      console.log(`No templates found for "${keyword}".`);
      const suggestions = searchTemplates(keyword, true, true).slice(0, 5);
      if (suggestions.length > 0) {
        console.log('Suggestions:');
        for (const s of suggestions) {
          console.log(`  ${s.template.id}: ${s.template.name}`);
        }
      }
      return;
    }

    console.log(`Found ${results.length} template(s) for "${keyword}":`);
    console.log('');
    for (const r of results) {
      const t = r.template;
      console.log(`${t.id} (score: ${r.score})`);
      console.log(`  Name:   ${t.name}`);
      console.log(`  Cat:    ${t.category}`);
      console.log(`  Modes:  ${t.supportedModes.join(', ')}`);
      console.log(`  Risk:   ${t.riskLevel}`);
      console.log(`  Tags:   ${t.tags.join(', ')}`);
      console.log(`  Match:  ${r.matchedFields.join(', ')}`);
      console.log('');
    }
  });

program
  .command('history')
  .description('List recent runs with summaries')
  .option('--limit <n>', 'Maximum number of runs to show', '20')
  .option('--status <status>', 'Filter by status (completed, failed, planned, running)')
  .option('--json', 'Output as JSON', false)
  .action((options: { limit: string; status?: string; json: boolean }) => {
    const limit = parseInt(options.limit, 10);
    const runs = listRunSummaries({ limit, status: options.status });

    if (options.json) {
      console.log(JSON.stringify(runs, null, 2));
      return;
    }

    if (runs.length === 0) {
      console.log('No runs found.');
      return;
    }

    const stats = computeRunHistoryStats();
    console.log(`Run History (${runs.length} of ${stats.totalRuns} total)`);
    console.log(`  Completed: ${stats.completedRuns} | Failed: ${stats.failedRuns}`);
    console.log(`  Screenshots: ${stats.totalScreenshots} | Blocked: ${stats.totalBlockedSteps} | Caution: ${stats.totalCautionSteps}`);
    console.log('');

    for (const run of runs) {
      const statusIcon = run.status === 'failed' ? '❌' : run.status === 'completed' ? '✅' : '⏳';
      const healthIcon = run.reportHealth === 'pass' ? '' : run.reportHealth === 'warn' ? '⚠️' : '❌';
      const ts = formatRunTimestamp(run.createdAt);
      console.log(`${statusIcon} ${getRunShortId(run.runId)} | ${run.templateName} | ${run.mode} | ${run.verdict} | health: ${run.reportHealth}${healthIcon} | ${ts}`);
      if (run.blockedCount > 0 || run.cautionCount > 0) {
        console.log(`   steps: allowed=${run.allowedCount} caution=${run.cautionCount} blocked=${run.blockedCount}`);
      }
      if (run.screenshotCount > 0 || run.traceZipPresent) {
        console.log(`   artifacts: screenshots=${run.screenshotCount} trace=${run.traceZipPresent ? 'yes' : 'no'}`);
      }
    }
  });

program
  .command('show <runId>')
  .description('Show detailed summary of a specific run')
  .option('--json', 'Output as JSON', false)
  .action((runId: string, options: { json: boolean }) => {
    const summary = readRunSummary(runId);
    if (!summary) {
      // Try finding by short ID
      const allRuns = listRunSummaries();
      const matched = allRuns.find((r) => r.shortRunId === runId);
      if (!matched) {
        console.error(`Run not found: ${runId}`);
        process.exit(1);
      }
      const fullSummary = readRunSummary(matched.runId);
      if (!fullSummary) {
        console.error(`Run not found: ${runId}`);
        process.exit(1);
      }
      if (options.json) {
        console.log(JSON.stringify(fullSummary, null, 2));
        return;
      }
      printRunSummary(fullSummary);
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    printRunSummary(summary);
  });

program
  .command('compare <runIdA> <runIdB>')
  .description('Compare two runs')
  .option('--json', 'Output as JSON', false)
  .option('--markdown', 'Output as markdown', false)
  .option('--output <path>', 'Write output to file instead of stdout')
  .action((runIdA: string, runIdB: string, options: { json: boolean; markdown: boolean; output?: string }) => {
    try {
      const comparison = compareRuns(runIdA, runIdB);
      let output: string;
      if (options.json) {
        output = generateComparisonJson(comparison);
      } else if (options.markdown) {
        output = generateComparisonMarkdown(comparison);
      } else {
        const lines: string[] = [];
        lines.push(`Comparing ${comparison.shortA} vs ${comparison.shortB}`);
        lines.push(`Overall: ${comparison.overallVerdict}`);
        lines.push('');
        const changed = comparison.differences.filter((d) => d.type !== 'unchanged');
        if (changed.length === 0) {
          lines.push('No differences found.');
        } else {
          lines.push('Differences:');
          for (const d of changed) {
            const icon = d.type === 'improved' ? 'improved' : d.type === 'worsened' ? 'worsened' : 'changed';
            lines.push(`  [${icon}] ${d.field}: ${String(d.a)} -> ${String(d.b)}`);
          }
        }
        output = lines.join('\n');
      }

      if (options.output) {
        fs.writeFileSync(options.output, output, 'utf-8');
        if (!options.json) {
          console.log(`Comparison written to: ${options.output}`);
        }
      } else {
        console.log(output);
      }
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ error: (err as Error).message }));
      } else {
        console.error((err as Error).message);
      }
      process.exit(1);
    }
  });

function printRunSummary(run: import('./runs/history.js').RunSummary) {
  console.log(`Run:        ${run.runId}`);
  console.log(`Short ID:   ${run.shortRunId}`);
  if (run.originalRunId) {
    console.log(`Rerun of:   ${run.originalRunId}`);
  }
  console.log(`Template:   ${run.templateName} (${run.templateId})`);
  console.log(`Mode:       ${run.mode}`);
  console.log(`Status:     ${run.status}`);
  console.log(`Verdict:    ${run.verdict}`);
  console.log(`Health:     ${run.reportHealth}`);
  if (run.dataSafetyStatus) {
    console.log(`Data Safety: ${run.dataSafetyStatus}`);
  }
  if (run.fixtureValidationStatus) {
    console.log(`Fixture Validation: ${run.fixtureValidationStatus}`);
  }
  if (run.artifactIntegrityStatus) {
    console.log(`Artifact Integrity: ${run.artifactIntegrityStatus}`);
  }
  console.log(`Steps:      allowed=${run.allowedCount} caution=${run.cautionCount} blocked=${run.blockedCount}`);
  console.log(`Findings:   pattern=${run.patternFindings} dom=${run.domFindings} policy=${run.policyFindings}`);
  console.log(`Screenshots: ${run.screenshotCount}`);
  console.log(`Trace:      ${run.traceZipPresent ? 'yes' : 'no'}`);
  console.log(`Created:    ${formatRunTimestamp(run.createdAt)}`);
  if (run.completedAt) {
    console.log(`Completed:  ${formatRunTimestamp(run.completedAt)}`);
  }
  console.log(`Run Dir:    ${run.runDir}`);
}

// Config command
program
  .command('config')
  .description('Show or initialize ForgeQA configuration')
  .option('--json', 'Output as JSON', false)
  .option('--show-paths', 'Show config/state/cache paths', false)
  .option('--init', 'Create .forgeqa/config.json with safe defaults', false)
  .option('--force', 'Overwrite existing config with --init', false)
  .action((options: { json: boolean; showPaths: boolean; init: boolean; force: boolean }) => {
    try {
      const paths = resolveForgeQAPaths();

      if (options.showPaths) {
        const output = {
          projectDir: paths.projectDir,
          projectConfigFile: paths.projectConfigFile,
          artifactsDir: paths.artifactsDir,
          runsDir: paths.runsDir,
          comparisonsDir: paths.comparisonsDir,
          userConfigFile: paths.userConfigFile,
          userStateDir: paths.userStateDir,
          userCacheDir: paths.userCacheDir,
        };
        if (options.json) {
          console.log(JSON.stringify(output, null, 2));
        } else {
          console.log('ForgeQA Paths');
          console.log('');
          for (const [key, value] of Object.entries(output)) {
            console.log(`${key}: ${value}`);
          }
        }
        return;
      }

      if (options.init) {
        const defaults: ForgeQAConfig = {
          defaultViewport: 'desktop',
          defaultMode: 'demo',
          artifactsDir: 'artifacts/runs',
          recentRunsLimit: 20,
          strictPolicyDefault: false,
        };
        const filePath = writeProjectConfig(defaults, options.force);
        if (options.json) {
          console.log(JSON.stringify({ created: filePath, defaults }, null, 2));
        } else {
          console.log(`Config created: ${filePath}`);
        }
        return;
      }

      const resolved = loadForgeQAConfig();
      const summary = getConfigSourceSummary();
      const output = {
        config: resolved.config,
        sources: resolved.sources,
        summary,
      };

      if (options.json) {
        console.log(JSON.stringify(output, null, 2));
      } else {
        console.log('ForgeQA Config');
        console.log('');
        for (const [key, value] of Object.entries(resolved.config)) {
          console.log(`${key}: ${value}`);
        }
        console.log('');
        console.log('Sources:');
        for (const s of resolved.sources) {
          console.log(`  ${s.name}: ${s.present ? 'present' : 'missing'} (${s.path})`);
        }
      }
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ error: (err as Error).message }));
      } else {
        console.error((err as Error).message);
      }
      process.exit(1);
    }
  });

// Rerun command
program
  .command('rerun <runId>')
  .description('Rerun a previous ForgeQA run with the same safe settings')
  .option('--json', 'Output machine-readable JSON', false)
  .option('--quiet', 'Print only runId and final status', false)
  .option('--verbose', 'Print detailed artifact list', false)
  .option('--dry-run', 'Preview what would rerun without executing', false)
  .option('--approve-external', 'Approve rerun of an external browser run', false)
  .option('--approve-diagnostic', 'Approve rerun of a diagnostic run', false)
  .option('--approve-risk <reason>', 'Human-approved risk reason for external mode', '')
  .option('--strict-policy', 'Treat caution-level actions as blocked', false)
  .option('--viewport <profile>', 'Device viewport profile', '')
  .option('--mobile', 'Shortcut for --viewport mobile', false)
  .action(async (runId: string, options: {
    json: boolean;
    quiet: boolean;
    verbose: boolean;
    dryRun: boolean;
    approveExternal: boolean;
    approveDiagnostic: boolean;
    approveRisk: string;
    strictPolicy: boolean;
    viewport: string;
    mobile: boolean;
  }) => {
    try {
      const ctx = generateNewRunContextFromRun(runId);
      if (!ctx.eligible) {
        throw new Error(`Run ${runId} is not eligible for rerun. ${ctx.warnings.join('; ')}`);
      }

      const originalRunDir = getRunDir(runId);
      const originalManifestPath = path.join(originalRunDir, 'run.json');
      let originalManifest: RunManifest | undefined;
      if (fs.existsSync(originalRunDir)) {
        try {
          originalManifest = JSON.parse(fs.readFileSync(originalManifestPath, 'utf-8'));
        } catch { /* ignore */ }
      }

      const originalPolicy = originalManifest?.executionPolicy;
      const isExternal = originalPolicy?.mode === 'external';
      const isDiagnostic = originalManifest?.templateId?.startsWith('diagnostic.');
      const wasDryRun = originalManifest?.dryRun === true;

      // Approval checks
      if (isExternal && !wasDryRun && !options.approveExternal) {
        throw new Error('External browser run requires --approve-external for rerun.');
      }
      if (isDiagnostic && !options.approveDiagnostic) {
        throw new Error('Diagnostic run requires --approve-diagnostic for rerun.');
      }
      if (originalPolicy?.allowSubmit && !options.approveRisk) {
        throw new Error('External submit rerun requires --approve-risk with a fresh reason.');
      }

      // Determine viewport
      let viewportName = options.mobile ? 'mobile' : (options.viewport || ctx.options.viewport || 'desktop');
      const { validateDeviceProfile, getDeviceProfile } = await import('./executor/device-profiles.js');
      if (!validateDeviceProfile(viewportName)) {
        throw new Error(`Invalid viewport "${viewportName}".`);
      }
      getDeviceProfile(viewportName); // validates profile exists

      if (options.dryRun) {
        const preview = {
          originalRunId: runId,
          newRunId: ctx.newRunId,
          newE2ERunId: ctx.newE2ERunId,
          templateId: ctx.options.templateId,
          mode: ctx.options.mode,
          viewport: viewportName,
          strictPolicy: options.strictPolicy || ctx.options.strictPolicy,
          dryRun: true,
          approvalsRequired: [] as string[],
          preservedOptions: {
            templateId: ctx.options.templateId,
            mode: ctx.options.mode,
            baseUrl: ctx.options.baseUrl,
            viewport: ctx.options.viewport,
            strictPolicy: ctx.options.strictPolicy,
          },
          changedOptions: {} as Record<string, unknown>,
        };
        if (viewportName !== ctx.options.viewport) {
          preview.changedOptions.viewport = `${ctx.options.viewport} -> ${viewportName}`;
        }
        if (options.strictPolicy !== ctx.options.strictPolicy) {
          preview.changedOptions.strictPolicy = `${ctx.options.strictPolicy} -> ${options.strictPolicy}`;
        }
        if (isExternal && !wasDryRun) preview.approvalsRequired.push('--approve-external');
        if (isDiagnostic) preview.approvalsRequired.push('--approve-diagnostic');
        if (originalPolicy?.allowSubmit) preview.approvalsRequired.push('--approve-risk');

        const previewDir = createRunArtifactsDir(ctx.newRunId);
        fs.writeFileSync(path.join(previewDir, 'rerun-preview.json'), JSON.stringify(preview, null, 2), 'utf-8');

        if (options.json) {
          console.log(JSON.stringify(preview, null, 2));
        } else if (options.quiet) {
          console.log(`${ctx.newRunId} preview`);
        } else {
          console.log(`Rerun preview: ${ctx.newRunId}`);
          console.log(`Original: ${runId}`);
          console.log(`Template: ${ctx.options.templateId}`);
          console.log(`Mode: ${ctx.options.mode}`);
          console.log(`Viewport: ${viewportName}`);
          if (preview.approvalsRequired.length > 0) {
            console.log(`Approvals required: ${preview.approvalsRequired.join(', ')}`);
          }
          console.log(`Preview written to: ${path.relative(process.cwd(), path.join(previewDir, 'rerun-preview.json'))}`);
        }
        return;
      }

      // Actual rerun: delegate to the standard run flow
      const prompt = originalManifest?.templateId ?? ctx.options.templateId;
      const mode = ctx.options.mode === 'external' ? 'external' : 'demo';

      const runOpts: RunWorkflowOptions = {
        demo: mode === 'demo',
        external: mode === 'external',
        baseUrl: ctx.options.baseUrl || '',
        allowHost: [],
        dryRunPlan: false,
        policyPreview: false,
        viewport: viewportName,
        mobile: options.mobile,
        allowSubmit: ctx.options.allowSubmit && !!options.approveRisk,
        allowUpload: ctx.options.allowUpload,
        approveRisk: options.approveRisk,
        strictPolicy: options.strictPolicy || ctx.options.strictPolicy,
        json: options.json,
        quiet: options.quiet,
        verbose: options.verbose,
      };

      await runWorkflow(prompt, runOpts, { originalRunId: runId });
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ error: (err as Error).message }));
      } else {
        console.error((err as Error).message);
      }
      process.exit(1);
    }
  });

// Open command
program
  .command('open <runId>')
  .description('Open a run report or artifact')
  .option('--html', 'Open report.html (default if present)', false)
  .option('--markdown', 'Open report.md', false)
  .option('--trace', 'Print trace.zip open command', false)
  .option('--launch', 'Launch trace viewer (requires --trace)', false)
  .option('--folder', 'Open the run folder', false)
  .option('--dry-run', 'Show what would be opened', false)
  .option('--json', 'Output target paths as JSON', false)
  .action((runId: string, options: {
    html: boolean;
    markdown: boolean;
    trace: boolean;
    launch: boolean;
    folder: boolean;
    dryRun: boolean;
    json: boolean;
  }) => {
    try {
      const openOpts: OpenOptions = {
        html: options.html,
        markdown: options.markdown,
        trace: options.trace,
        launch: options.launch,
        folder: options.folder,
        dryRun: options.dryRun,
        json: options.json,
      };
      const result = openRunArtifact(runId, openOpts);

      if (options.json) {
        console.log(JSON.stringify({
          runId,
          targetType: result.target.type,
          relativePath: result.target.relativePath,
          absolutePath: result.target.absolutePath,
          exists: result.target.exists,
          command: result.target.command,
          opened: result.opened,
          dryRun: result.dryRun,
        }, null, 2));
        return;
      }

      if (options.dryRun) {
        console.log(`Would open: ${result.target.relativePath}`);
        if (result.command) {
          console.log(`Command: ${result.command}`);
        }
        return;
      }

      if (!result.target.exists) {
        console.error(`Artifact not found: ${result.target.relativePath}`);
        process.exit(1);
      }

      if (result.target.type === 'trace') {
        console.log(`Trace archive: ${result.target.absolutePath}`);
        console.log(`To inspect, run: ${result.target.command}`);
        return;
      }

      if (result.command) {
        console.log(`Opening: ${result.target.absolutePath}`);
        console.log(`Run: ${result.command}`);
      } else {
        console.log(`Path: ${result.target.absolutePath}`);
        console.log('No platform open command available. Open the path manually.');
      }
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ error: (err as Error).message }));
      } else {
        console.error((err as Error).message);
      }
      process.exit(1);
    }
  });

function collectPrompts(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

function getBatchOptions(options: {
  prompt: string[];
  file: string;
  demo: boolean;
  external: boolean;
  baseUrl: string;
  includeDiagnostics: boolean;
  includePolicy: boolean;
  approveExternal: boolean;
  approveRisk: string;
  strictPolicy: boolean;
  viewport: string;
  mobile: boolean;
  industry?: string;
  recommendIndustry?: boolean;
  json: boolean;
  quiet: boolean;
  verbose: boolean;
}) {
  let prompts: string[] = [];
  if (options.file) {
    const fileContent = JSON.parse(fs.readFileSync(options.file, 'utf-8'));
    prompts = fileContent.prompts ?? [];
  }
  if (options.prompt.length > 0) {
    prompts = [...prompts, ...options.prompt];
  }

  if (prompts.length === 0) {
    throw new Error('No prompts provided. Use --prompt or --file.');
  }

  const mode = options.external ? 'external' : 'demo';
  const viewport = options.mobile ? 'mobile' : options.viewport;
  const batchOptions = {
    mode: mode as 'demo' | 'external',
    viewport,
    strictPolicy: options.strictPolicy,
    includeDiagnostics: options.includeDiagnostics,
    includePolicy: options.includePolicy,
    approveExternal: options.approveExternal,
    approveRisk: options.approveRisk,
    baseUrl: options.external ? options.baseUrl : undefined,
    industry: options.industry || undefined,
    recommendIndustry: options.recommendIndustry || false,
    includeIndustryCaveats: true,
    json: options.json,
    quiet: options.quiet,
    verbose: options.verbose,
  };

  return { prompts, batchOptions };
}

function writeBatchArtifacts(plan: import('./batch/types.js').BatchPlan) {
  const batchDir = path.join(process.cwd(), 'artifacts', 'batches', plan.batchId);
  fs.mkdirSync(batchDir, { recursive: true });
  fs.writeFileSync(path.join(batchDir, 'batch-plan.json'), JSON.stringify(plan, null, 2), 'utf-8');
  return batchDir;
}

// Batch preview subcommand
program
  .command('batch-preview')
  .alias('batch preview')
  .description('Generate batch plan without executing')
  .option('--prompt <prompt>', 'Add a prompt to the batch (repeatable)', collectPrompts, [])
  .option('--file <path>', 'Read prompts from a JSON file', '')
  .option('--demo', 'Force demo mode', false)
  .option('--external', 'External mode (requires approval)', false)
  .option('--base-url <url>', 'Base URL for external mode', '')
  .option('--include-diagnostics', 'Include diagnostic scenarios', false)
  .option('--include-policy', 'Include policy scenarios', false)
  .option('--approve-external', 'Approve external browser runs', false)
  .option('--approve-risk <reason>', 'Approve risk for external mode', '')
  .option('--strict-policy', 'Treat caution-level actions as blocked', false)
  .option('--viewport <profile>', 'Device viewport profile', 'desktop')
  .option('--mobile', 'Shortcut for --viewport mobile', false)
  .option('--industry <packId>', 'Apply an industry readiness pack to the batch', '')
  .option('--recommend-industry', 'Recommend industry packs based on batch prompts', false)
  .option('--json', 'Output machine-readable JSON', false)
  .option('--quiet', 'Print minimal output', false)
  .option('--verbose', 'Print detailed output', false)
  .action(async (options: {
    prompt: string[];
    file: string;
    demo: boolean;
    external: boolean;
    baseUrl: string;
    includeDiagnostics: boolean;
    includePolicy: boolean;
    approveExternal: boolean;
    approveRisk: string;
    strictPolicy: boolean;
    viewport: string;
    mobile: boolean;
    industry: string;
    recommendIndustry: boolean;
    json: boolean;
    quiet: boolean;
    verbose: boolean;
  }) => {
    const { createBatchPlan, generateBatchPlanMarkdown } = await import('./batch/planner.js');

    try {
      const { prompts, batchOptions } = getBatchOptions(options);
      const plan = createBatchPlan(prompts, batchOptions);
      const batchDir = writeBatchArtifacts(plan);
      fs.writeFileSync(path.join(batchDir, 'batch-plan.md'), generateBatchPlanMarkdown(plan), 'utf-8');

      if (options.json) {
        console.log(JSON.stringify(plan, null, 2));
      } else if (options.quiet) {
        console.log(`${plan.batchId} preview ${plan.estimatedRunCount}`);
      } else {
        console.log(`Batch plan: ${plan.batchId}`);
        console.log(`Items: ${plan.resolvedTemplates.length}`);
        console.log(`Skipped: ${plan.skippedPrompts.length}`);
        console.log(`Artifacts: artifacts/batches/${plan.batchId}/`);
      }
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ error: (err as Error).message }));
      } else {
        console.error((err as Error).message);
      }
      process.exit(1);
    }
  });

// Batch run subcommand
program
  .command('batch-run')
  .alias('batch run')
  .description('Execute batch plan sequentially')
  .option('--prompt <prompt>', 'Add a prompt to the batch (repeatable)', collectPrompts, [])
  .option('--file <path>', 'Read prompts from a JSON file', '')
  .option('--demo', 'Force demo mode', false)
  .option('--external', 'External mode (requires approval)', false)
  .option('--base-url <url>', 'Base URL for external mode', '')
  .option('--include-diagnostics', 'Include diagnostic scenarios', false)
  .option('--include-policy', 'Include policy scenarios', false)
  .option('--approve-external', 'Approve external browser runs', false)
  .option('--approve-risk <reason>', 'Approve risk for external mode', '')
  .option('--strict-policy', 'Treat caution-level actions as blocked', false)
  .option('--viewport <profile>', 'Device viewport profile', 'desktop')
  .option('--mobile', 'Shortcut for --viewport mobile', false)
  .option('--industry <packId>', 'Apply an industry readiness pack to the batch', '')
  .option('--recommend-industry', 'Recommend industry packs based on batch prompts', false)
  .option('--json', 'Output machine-readable JSON', false)
  .option('--quiet', 'Print minimal output', false)
  .option('--verbose', 'Print detailed output', false)
  .action(async (options: {
    prompt: string[];
    file: string;
    demo: boolean;
    external: boolean;
    baseUrl: string;
    includeDiagnostics: boolean;
    includePolicy: boolean;
    approveExternal: boolean;
    approveRisk: string;
    strictPolicy: boolean;
    viewport: string;
    mobile: boolean;
    industry: string;
    recommendIndustry: boolean;
    json: boolean;
    quiet: boolean;
    verbose: boolean;
  }) => {
    const { createBatchPlan, generateBatchPlanMarkdown, generateBatchResultMarkdown } = await import('./batch/planner.js');
    const { executeBatchPlan, summarizeBatchResult } = await import('./batch/executor.js');

    try {
      const { prompts, batchOptions } = getBatchOptions(options);
      const plan = createBatchPlan(prompts, batchOptions);
      const batchDir = writeBatchArtifacts(plan);
      fs.writeFileSync(path.join(batchDir, 'batch-plan.md'), generateBatchPlanMarkdown(plan), 'utf-8');

      const result = await executeBatchPlan(plan, batchOptions);
      fs.writeFileSync(path.join(batchDir, 'batch-result.json'), JSON.stringify(result, null, 2), 'utf-8');
      fs.writeFileSync(path.join(batchDir, 'batch-result.md'), generateBatchResultMarkdown(result), 'utf-8');

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else if (options.quiet) {
        console.log(`${result.batchId} ${result.status} ${result.passCount}/${result.items.length}`);
      } else {
        console.log(summarizeBatchResult(result));
        console.log(`Artifacts: artifacts/batches/${result.batchId}/`);
      }
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ error: (err as Error).message }));
      } else {
        console.error((err as Error).message);
      }
      process.exit(1);
    }
  });

program
  .command('batch-validate <batchId>')
  .alias('batch validate')
  .alias('validate-batch')
  .description('Validate batch artifacts for integrity and completeness')
  .option('--json', 'Output machine-readable JSON', false)
  .option('--strict', 'Treat warnings as failures', false)
  .option('--fix', 'Repair common low-risk portability issues', false)
  .option('--force-fix', 'Overwrite existing aliases during repair', false)
  .option('--fix-linked-runs', 'Also attempt to repair linked run artifacts (use with care)', false)
  .option('--output <path>', 'Write validation output to custom path', '')
  .action(async (batchId: string, options: { json: boolean; strict: boolean; fix: boolean; forceFix: boolean; fixLinkedRuns: boolean; output: string }) => {
    const { validateBatchArtifacts, generateBatchValidationMarkdown, generateBatchValidationJson } = await import('./batch/validator.js');
    const { generateBatchManifest, generateBatchManifestJson } = await import('./batch/manifest.js');

    try {
      let result = validateBatchArtifacts(batchId, { strict: options.strict });

      // Regenerate/update manifest
      const batchResultPath = path.join(process.cwd(), 'artifacts', 'batches', batchId, 'batch-result.json');
      let manifest;
      if (fs.existsSync(batchResultPath)) {
        const batchResult = JSON.parse(fs.readFileSync(batchResultPath, 'utf-8'));
        manifest = generateBatchManifest(batchResult);
        manifest.validationStatus = result.status;
        fs.writeFileSync(path.join(process.cwd(), 'artifacts', 'batches', batchId, 'batch-manifest.json'), generateBatchManifestJson(manifest), 'utf-8');
      }

      const batchDir = path.join(process.cwd(), 'artifacts', 'batches', batchId);
      if (options.output) {
        const outDir = path.dirname(options.output);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(options.output, generateBatchValidationJson(result), 'utf-8');
      } else {
        fs.writeFileSync(path.join(batchDir, 'batch-validation.json'), generateBatchValidationJson(result), 'utf-8');
        fs.writeFileSync(path.join(batchDir, 'batch-validation.md'), generateBatchValidationMarkdown(result), 'utf-8');
      }

      let repairResult: import('./artifacts/repair-types.js').RepairResult | undefined;
      if (options.fix) {
        const { repairBatchArtifacts, writeBatchRepairArtifacts } = await import('./batch/repair.js');
        repairResult = repairBatchArtifacts(batchId, { forceFix: options.forceFix, fixLinkedRuns: options.fixLinkedRuns });
        writeBatchRepairArtifacts(repairResult);
        // Re-validate after repair
        result = validateBatchArtifacts(batchId, { strict: options.strict });
        const batchMd = generateBatchValidationMarkdown(result);
        const batchMdWithRepair = fs.existsSync(path.join(batchDir, 'batch-repair.json'))
          ? batchMd + '\n## Repair Summary\nSee [batch-repair.md](batch-repair.md) for repair details.\n'
          : batchMd;
        fs.writeFileSync(path.join(batchDir, 'batch-validation.json'), generateBatchValidationJson(result), 'utf-8');
        fs.writeFileSync(path.join(batchDir, 'batch-validation.md'), batchMdWithRepair, 'utf-8');
      }

      if (options.json) {
        const output: Record<string, unknown> = {
          batchId,
          status: result.status,
          checks: result.summary.totalChecks,
          pass: result.summary.passCount,
          warn: result.summary.warnCount,
          fail: result.summary.failCount,
          missingFiles: result.summary.missingFiles,
          brokenLinks: result.summary.brokenLinks,
        };
        if (repairResult) {
          output.repairStatus = repairResult.status;
          output.repairActions = repairResult.summary;
        }
        console.log(JSON.stringify(output, null, 2));
      } else {
        console.log(`Batch ${batchId}: ${result.status.toUpperCase()}`);
        console.log(`Checks: ${result.summary.totalChecks}, Pass: ${result.summary.passCount}, Warn: ${result.summary.warnCount}, Fail: ${result.summary.failCount}`);
        if (repairResult) {
          console.log(`Repair: ${repairResult.status} (${repairResult.summary.fixedCount} fixed, ${repairResult.summary.manualReviewCount} manual review)`);
        }
        if (result.summary.missingFiles.length > 0) {
          console.log(`Missing files: ${result.summary.missingFiles.join(', ')}`);
        }
        if (result.summary.brokenLinks.length > 0) {
          console.log(`Broken links: ${result.summary.brokenLinks.length}`);
        }
        if (result.summary.absolutePathFindings.length > 0) {
          console.log(`Portability issues: ${result.summary.absolutePathFindings.length}`);
        }
      }

      if (result.status === 'fail' || (options.strict && result.status === 'warn')) {
        process.exit(1);
      }
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ error: (err as Error).message }));
      } else {
        console.error((err as Error).message);
      }
      process.exit(1);
    }
  });

program
  .command('release-check')
  .description('Run local MVP release readiness gate')
  .option('--json', 'Output machine-readable JSON', false)
  .option('--strict', 'Treat warnings as failures', false)
  .option('--include-browser', 'Check browser test readiness', false)
  .option('--include-smoke', 'Include smoke tests (slower)', false)
  .option('--include-batch', 'Include batch tests (slower)', false)
  .option('--include-industry', 'Include industry tests (slower)', false)
  .option('--include-repair-smoke', 'Include repair engine smoke check', false)
  .option('--include-unified-report-smoke', 'Include unified report smoke check', false)
  .option('--include-batch-report-smoke', 'Include batch unified report smoke check', false)
  .option('--include-dashboard-smoke', 'Include dashboard smoke check', false)
  .option('--output <path>', 'Write output to custom path', '')
  .action(async (options: {
    json: boolean;
    strict: boolean;
    includeBrowser: boolean;
    includeSmoke: boolean;
    includeBatch: boolean;
    includeIndustry: boolean;
    includeRepairSmoke: boolean;
    includeUnifiedReportSmoke: boolean;
    includeBatchReportSmoke: boolean;
    includeDashboardSmoke: boolean;
    output: string;
  }) => {
    const { runReleaseCheck, generateReleaseCheckMarkdown, generateReleaseCheckJson } = await import('./release/check.js');

    try {
      const result = await runReleaseCheck({
        includeBrowser: options.includeBrowser,
        includeSmoke: options.includeSmoke,
        includeBatch: options.includeBatch,
        includeIndustry: options.includeIndustry,
        includeRepairSmoke: options.includeRepairSmoke,
        includeUnifiedReportSmoke: options.includeUnifiedReportSmoke,
        includeBatchReportSmoke: options.includeBatchReportSmoke,
        includeDashboardSmoke: options.includeDashboardSmoke,
      });

      const releaseDir = path.join(process.cwd(), 'artifacts', 'release');
      fs.mkdirSync(releaseDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.writeFileSync(path.join(releaseDir, `release-check-${timestamp}.json`), generateReleaseCheckJson(result), 'utf-8');
      fs.writeFileSync(path.join(releaseDir, `release-check-${timestamp}.md`), generateReleaseCheckMarkdown(result), 'utf-8');
      fs.writeFileSync(path.join(releaseDir, 'latest-release-check.json'), generateReleaseCheckJson(result), 'utf-8');
      fs.writeFileSync(path.join(releaseDir, 'latest-release-check.md'), generateReleaseCheckMarkdown(result), 'utf-8');

      if (options.output) {
        const outDir = path.dirname(options.output);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(options.output, generateReleaseCheckJson(result), 'utf-8');
      }

      if (options.json) {
        console.log(generateReleaseCheckJson(result));
      } else {
        console.log(`Release Check: ${result.status.toUpperCase()}`);
        console.log(`Checks: ${result.summary.total}, Pass: ${result.summary.pass}, Warn: ${result.summary.warn}, Fail: ${result.summary.fail}`);
        if (result.summary.fail > 0) {
          console.log('Failures:');
          for (const c of result.checks.filter((c) => c.status === 'fail')) {
            console.log(`  [FAIL] ${c.id}: ${c.message}`);
          }
        }
        if (result.summary.warn > 0) {
          console.log('Warnings:');
          for (const c of result.checks.filter((c) => c.status === 'warn')) {
            console.log(`  [WARN] ${c.id}: ${c.message}`);
          }
        }
        console.log(`Artifacts: artifacts/release/`);
        console.log(`Next: ${result.recommendedNextAction}`);
      }

      if (result.status === 'fail' || (options.strict && result.status === 'warn')) {
        process.exit(1);
      }
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ error: (err as Error).message }));
      } else {
        console.error((err as Error).message);
      }
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show local MVP status summary')
  .option('--json', 'Output machine-readable JSON', false)
  .action((options: { json: boolean }) => {
    const runs = listRunDirs();
    const batches = (() => {
      const batchDir = path.join(process.cwd(), 'artifacts', 'batches');
      if (!fs.existsSync(batchDir)) return [];
      return fs.readdirSync(batchDir).filter((id) => {
        const dir = path.join(batchDir, id);
        return fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, 'batch-plan.json'));
      });
    })();

    const latestReleaseCheck = (() => {
      const releaseDir = path.join(process.cwd(), 'artifacts', 'release');
      const latestPath = path.join(releaseDir, 'latest-release-check.json');
      if (fs.existsSync(latestPath)) {
        try {
          return JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
        } catch { /* ignore */ }
      }
      return null;
    })();

    const templateCount = listTemplates().length;
    const diagnosticCount = (() => {
      try {
        return listDiagnosticTemplates().length;
      } catch { return 0; }
    })();
    const industryCount = (() => {
      try {
        return listIndustryPacks().length;
      } catch { return 0; }
    })();

    const localStatus = latestReleaseCheck?.status === 'pass'
      ? 'local_ready'
      : latestReleaseCheck?.status === 'warn'
        ? 'local_ready_with_warnings'
        : latestReleaseCheck?.status === 'fail'
          ? 'not_ready'
          : 'needs_human_review';

    // Optionally read dashboard summary
    const dashboardSummary = (() => {
      const dashPath = path.join(process.cwd(), 'artifacts', 'dashboard', 'project-overview.json');
      if (fs.existsSync(dashPath)) {
        try {
          const dash = JSON.parse(fs.readFileSync(dashPath, 'utf-8'));
          return {
            healthScore: dash.summary?.overallHealthScore ?? undefined,
            readyRuns: dash.summary?.readyRunCount ?? undefined,
            latestDashboardAt: dash.createdAt ?? undefined,
          };
        } catch { /* ignore */ }
      }
      return undefined;
    })();

    if (options.json) {
      const output: Record<string, unknown> = {
        runCount: runs.length,
        batchCount: batches.length,
        latestReleaseCheckStatus: latestReleaseCheck?.status ?? 'unknown',
        templateCount,
        diagnosticCount,
        industryPackCount: industryCount,
        localStatus,
      };
      if (dashboardSummary) {
        output.dashboard = dashboardSummary;
      }
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log('ForgeQA Local MVP Status');
      console.log('');
      console.log(`Runs:        ${runs.length}`);
      console.log(`Batches:     ${batches.length}`);
      console.log(`Templates:   ${templateCount}`);
      console.log(`Diagnostics: ${diagnosticCount}`);
      console.log(`Industry:    ${industryCount}`);
      console.log(`Release:     ${latestReleaseCheck?.status ?? 'not checked'}`);
      if (dashboardSummary) {
        console.log(`Dashboard:   health ${dashboardSummary.healthScore}/100, ${dashboardSummary.readyRuns} ready runs`);
      }
      console.log(`Status:      ${localStatus}`);
    }
  });

program
  .command('scan')
  .description('Scan a page for testability before running workflows')
  .option('--demo-route <route>', 'Demo fixture route to scan (e.g. /multi-step-form)', '')
  .option('--external', 'Scan an external target (requires --base-url)', false)
  .option('--base-url <url>', 'Base URL for external scan', '')
  .option('--viewport <profile>', 'Device viewport profile (desktop|mobile|tablet|small-mobile)', 'desktop')
  .option('--mobile', 'Shortcut for --viewport mobile', false)
  .option('--template <templateId>', 'Optional template ID for context', '')
  .option('--industry <packId>', 'Apply an industry readiness pack to the scan', '')
  .option('--recommend-industry', 'Recommend industry packs based on scan results', false)
  .option('--json', 'Output machine-readable JSON summary', false)
  .option('--quiet', 'Print only scanId and status', false)
  .option('--verbose', 'Print detailed findings', false)
  .option('--output <path>', 'Custom output directory for scan artifacts', '')
  .action(async (options: {
    demoRoute: string;
    external: boolean;
    baseUrl: string;
    viewport: string;
    mobile: boolean;
    template: string;
    industry: string;
    recommendIndustry: boolean;
    json: boolean;
    quiet: boolean;
    verbose: boolean;
    output: string;
  }) => {
    const { runDemoScan, runExternalScan } = await import('./scanner/app-scanner.js');
    const { generateScanMarkdown, generateScanHtml } = await import('./scanner/reports.js');
    const { recommendTemplates } = await import('./scanner/template-recommender.js');
    const { recommendIndustryPacks } = await import('./industry/registry.js');
    const { assessScanAgainstIndustryPack, generateIndustryAssessmentMarkdown, generateIndustryAssessmentJson } = await import('./industry/assessor.js');

    try {
      let scanResult: { scan: any; artifactsDir: string };

      if (options.external) {
        if (!options.baseUrl) {
          console.error('External scan requires --base-url');
          process.exit(1);
        }
        scanResult = await runExternalScan(options.baseUrl, undefined, options.viewport, options.mobile);
      } else {
        if (!options.demoRoute) {
          console.error('Demo scan requires --demo-route');
          process.exit(1);
        }
        scanResult = await runDemoScan(options.demoRoute, options.viewport, options.mobile);
      }

      const { scan, artifactsDir } = scanResult;
      const templateRecs = recommendTemplates(scan.findings);
      scan.suggestedTemplates = templateRecs;

      // Industry pack integration
      const industryRecs = options.recommendIndustry ? recommendIndustryPacks(scan) : [];
      let industryAssessment: import('./industry/types.js').IndustryPackAssessment | null = null;
      if (options.industry) {
        industryAssessment = assessScanAgainstIndustryPack(scan, options.industry as import('./industry/types.js').IndustryPackId);
        if (industryAssessment) {
          const industryMd = generateIndustryAssessmentMarkdown(industryAssessment);
          const industryJson = generateIndustryAssessmentJson(industryAssessment);
          fs.writeFileSync(path.join(artifactsDir, 'industry-assessment.md'), industryMd, 'utf-8');
          fs.writeFileSync(path.join(artifactsDir, 'industry-assessment.json'), industryJson, 'utf-8');
        }
      }

      const mdReport = generateScanMarkdown(scan, templateRecs);
      const htmlReport = generateScanHtml(scan, templateRecs);

      const mdPath = path.join(artifactsDir, 'scan-report.md');
      const htmlPath = path.join(artifactsDir, 'scan-report.html');
      fs.writeFileSync(mdPath, mdReport, 'utf-8');
      fs.writeFileSync(htmlPath, htmlReport, 'utf-8');

      scan.artifacts.scanReportMd = mdPath;
      scan.artifacts.scanReportHtml = htmlPath;

      // Update scan-result.json with final data
      fs.writeFileSync(path.join(artifactsDir, 'scan-result.json'), JSON.stringify(scan, null, 2), 'utf-8');

      if (options.json) {
        const jsonOutput: Record<string, unknown> = {
          scanId: scan.scanId,
          status: scan.status,
          score: scan.score.overall,
          targetUrl: scan.targetUrl,
          mode: scan.mode,
          artifactsDir: path.relative(process.cwd(), artifactsDir),
          totalFindings: scan.summary.totalFindings,
          criticalCount: scan.summary.criticalCount,
          errorCount: scan.summary.errorCount,
          warningCount: scan.summary.warningCount,
          recommendations: scan.recommendations,
          suggestedTemplates: templateRecs.map((t) => ({ templateId: t.templateId, confidence: t.confidence })),
        };
        if (industryRecs.length > 0) {
          jsonOutput.suggestedIndustryPacks = industryRecs.map((r) => ({ packId: r.packId, packName: r.packName, confidence: r.confidence, reason: r.reason }));
        }
        if (industryAssessment) {
          jsonOutput.industryAssessment = {
            packId: industryAssessment.packId,
            packName: industryAssessment.packName,
            status: industryAssessment.status,
            score: industryAssessment.score,
          };
        }
        console.log(JSON.stringify(jsonOutput, null, 2));
      } else if (options.quiet) {
        console.log(`${scan.scanId} ${scan.status} ${scan.score.overall}`);
      } else {
        console.log(`Scan complete: ${scan.scanId}`);
        console.log(`Status:      ${scan.status}`);
        console.log(`Score:       ${scan.score.overall}/100`);
        console.log(`Target:      ${scan.targetUrl}`);
        console.log(`Findings:    ${scan.summary.totalFindings} (critical: ${scan.summary.criticalCount}, error: ${scan.summary.errorCount}, warn: ${scan.summary.warningCount})`);
        console.log(`Artifacts:   ${path.relative(process.cwd(), artifactsDir)}/`);
        if (industryRecs.length > 0) {
          console.log('');
          console.log('Suggested Industry Packs:');
          for (const r of industryRecs) {
            console.log(`  ${r.packId} — ${r.packName} (${Math.round(r.confidence * 100)}% confidence)`);
          }
        }
        if (industryAssessment) {
          console.log('');
          console.log(`Industry Assessment: ${industryAssessment.packName}`);
          console.log(`  Status: ${industryAssessment.status}`);
          console.log(`  Score:  ${industryAssessment.score}/100`);
        }
        if (options.verbose) {
          console.log('');
          for (const f of scan.findings) {
            console.log(`[${f.severity.toUpperCase()}] ${f.title}: ${f.message}`);
          }
        }
      }

      if (scan.status === 'fail') {
        process.exit(1);
      }
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ error: (err as Error).message }));
      } else {
        console.error((err as Error).message);
      }
      process.exit(1);
    }
  });

program
  .command('prune')
  .description('Audit and optionally remove old local artifacts (dry-run by default)')
  .option('--json', 'Output machine-readable JSON', false)
  .option('--dry-run', 'Show what would be removed without deleting', true)
  .option('--confirm', 'Actually delete matching artifacts (requires filters)', false)
  .option('--older-than-days <n>', 'Only target artifacts older than N days', '')
  .option('--runs', 'Include run artifacts', false)
  .option('--batches', 'Include batch artifacts', false)
  .option('--release', 'Include release-check artifacts', false)
  .option('--dashboard', 'Include dashboard artifacts', false)
  .option('--status <status>', 'Filter runs by status (completed|failed|dry-run|not_ready)', '')
  .option('--keep-latest <n>', 'Keep the latest N artifacts per type', '')
  .action(async (options: {
    json: boolean;
    dryRun: boolean;
    confirm: boolean;
    olderThanDays: string;
    runs: boolean;
    batches: boolean;
    release: boolean;
    dashboard: boolean;
    status: string;
    keepLatest: string;
  }) => {
    const { runPrune } = await import('./artifacts/prune.js');

    const pruneOptions: import('./artifacts/prune.js').PruneOptions = {
      dryRun: !options.confirm || options.dryRun,
      confirm: options.confirm,
      olderThanDays: options.olderThanDays ? parseInt(options.olderThanDays, 10) : undefined,
      runs: options.runs,
      batches: options.batches,
      release: options.release,
      dashboard: options.dashboard,
      status: options.status as import('./artifacts/prune.js').PruneOptions['status'] || undefined,
      keepLatest: options.keepLatest ? parseInt(options.keepLatest, 10) : undefined,
    };

    const report = runPrune(pruneOptions);

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`Prune: ${report.mode.toUpperCase()}`);
      console.log(`Targets: ${report.summary.totalTargets}, Kept: ${report.summary.totalKept}`);
      console.log(`Reclaimed: ${report.summary.bytesReclaimed} bytes`);
      if (!report.safe) {
        console.log('Warning: Actual deletion refused. Provide filters (--runs, --batches, --older-than-days) with --confirm.');
      }
      console.log(`Report: artifacts/prune/prune-report.md`);
    }

    if (report.summary.totalTargets > 0 && !report.safe) {
      process.exit(1);
    }
  });

program.addCommand(industryCli);

program.parse();
