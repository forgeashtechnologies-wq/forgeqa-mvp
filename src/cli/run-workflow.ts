import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { matchPrompt } from '../templates/registry.js';
import { buildPlan, createPlanContext } from '../plan/planner.js';
import { generateGoldenData } from '../data/generator.js';
import {
  createRunArtifactsDir,
  writePlan,
  writeData,
  writeRunManifest,
  finalizeRunManifest,
  writeReportMarkdown,
  writeReportHtml,
  writeCleanupReport,
  writeArtifactValidation,
  writeArtifactManifest,
  writeDataSafetyAudit,
  writeDataSafetyAuditMarkdown,
  writeScopeAnalysis,
  writeScopeAnalysisMarkdown,
  writeFailureClassification,
  writeFailureClassificationMarkdown,
  writeScreenshotGalleryHtml,
  writeScreenshotGalleryMarkdown,
  writeScreenshotGalleryJson,
  writeIndustryAssessmentJson,
  writeIndustryAssessmentMarkdown,
  listArtifacts,
} from '../artifacts/manager.js';
import { generateArtifactManifest } from '../artifacts/manifest.js';
import { execute } from '../executor/playwright.js';
import { generateMarkdownReport, computeReadinessVerdict } from '../report/markdown.js';
import { generateHtmlReport } from '../report/html.js';
import { analyzeCleanup, generateCleanupMarkdown } from '../cleanup/analyzer.js';
import { runDataSafetyAudit, generateDataSafetyAuditMarkdown } from '../data/audit.js';
import { analyzePatterns } from '../patterns/analyzer.js';
import { mergePatternAndDomFindings } from '../patterns/deduplication.js';
import { validateRunArtifacts } from '../artifacts/validator.js';
import {
  validateFixtureFile,
  generateFixtureValidationMarkdown,
  type FixtureValidationResult,
} from '../fixtures/validator.js';
import {
  parseAndValidateBaseUrl,
  createNavigationPolicy,
  isAllowedNavigation,
  resolveWorkflowUrl,
} from '../policy/url-policy.js';
import {
  evaluateWorkflowPolicy,
  buildExecutionPolicySummary,
  generatePolicyPreviewMarkdown,
  type ExecutionPolicyContext,
} from '../policy/execution-policy.js';
import type { PatternFinding } from '../patterns/types.js';
import type { RunManifest } from '../schemas/core.js';
import { analyzeScope, generateScopeAnalysisMarkdown } from '../scope/analyzer.js';
import { classifyFailures, generateFailureClassificationMarkdown } from '../failures/classifier.js';
import { buildGalleryData, generateGalleryHtml, generateGalleryMarkdown } from '../evidence/gallery.js';
import { runAppTestabilityScan } from '../scanner/app-scanner.js';
import { generateScanMarkdown, generateScanHtml } from '../scanner/reports.js';
import { recommendTemplates } from '../scanner/template-recommender.js';
import type { AppTestabilityScan } from '../scanner/types.js';
import { getIndustryPackById } from '../industry/registry.js';
import { assessIndustryReadiness, generateIndustryAssessmentMarkdown, generateIndustryAssessmentJson } from '../industry/assessor.js';
import type { IndustryPackAssessment } from '../industry/types.js';

export interface RunWorkflowOptions {
  demo: boolean;
  external: boolean;
  baseUrl: string;
  allowHost: string[];
  dryRunPlan: boolean;
  policyPreview: boolean;
  viewport: string;
  mobile: boolean;
  allowSubmit: boolean;
  allowUpload: boolean;
  approveRisk: string;
  strictPolicy: boolean;
  preflightScan?: boolean;
  industry?: string;
  recommendIndustry?: boolean;
  validate?: boolean;
  strict?: boolean;
  json: boolean;
  quiet: boolean;
  verbose: boolean;
}

export interface RunWorkflowResult {
  runId: string;
  status: string;
  verdict: string;
  reportHealth: string;
  artifactPath: string;
}

export async function runWorkflow(
  prompt: string,
  options: RunWorkflowOptions,
  rerunMeta?: { originalRunId: string },
): Promise<RunWorkflowResult> {
  // Validate flag combinations
  if (options.demo && options.external) {
    console.error('Error: --demo and --external are mutually exclusive.');
    process.exit(1);
  }

  if (options.external) {
    if (!options.baseUrl) {
      console.error('Error: --external requires --base-url <url>');
      process.exit(1);
    }
  }

  if (options.allowSubmit && !options.external) {
    console.error('Error: --allow-submit requires --external');
    process.exit(1);
  }

  if (options.allowUpload && !options.external) {
    console.error('Error: --allow-upload requires --external');
    process.exit(1);
  }

  const isInteractive = !options.json && !options.quiet;
  if (isInteractive) {
    p.intro('ForgeQA MVP');
  }

  const s = isInteractive ? p.spinner() : null;
  if (s) s.start('Matching prompt to approved workflow template...');

  const match = matchPrompt(prompt);
  if (!match.matched) {
    if (s) s.stop('No matching template found.');
    if (isInteractive) {
      p.cancel(`No exact template match for: "${prompt}"`);
      console.error('Suggested templates:', match.suggestions.join(', '));
    }
    if (options.json) {
      console.log(JSON.stringify({ error: 'No matching template', suggestions: match.suggestions }));
    }
    process.exit(1);
  }

  if (options.external && !match.template.supportedModes.includes('external')) {
    if (s) s.stop('Template not supported in external mode.');
    console.error(`Error: Template "${match.template.id}" does not support external mode.`);
    console.error('Supported modes:', match.template.supportedModes.join(', '));
    process.exit(1);
  }

  if (s) s.stop(`Matched template: ${match.template.id}`);

  // Validate --allow-submit against template metadata
  if (options.allowSubmit) {
    if (!options.approveRisk || options.approveRisk.trim().length === 0) {
      console.error('Error: --allow-submit requires --approve-risk "<reason>"');
      process.exit(1);
    }
    if (match.template.allowExternalSubmit !== true) {
      console.error(`Error: Template "${match.template.id}" does not allow external submit.`);
      console.error('Set template.allowExternalSubmit=true to enable --allow-submit for this template.');
      process.exit(1);
    }
  }

  // Validate --allow-upload against template metadata
  if (options.allowUpload) {
    if (!options.approveRisk || options.approveRisk.trim().length === 0) {
      console.error('Error: --allow-upload requires --approve-risk "<reason>"');
      process.exit(1);
    }
    if (match.template.allowExternalUpload !== true) {
      console.error(`Error: Template "${match.template.id}" does not allow external upload.`);
      console.error('Set template.allowExternalUpload=true to enable --allow-upload for this template.');
      process.exit(1);
    }
  }

  // Determine viewport
  const { validateDeviceProfile, getDeviceProfile } = await import('../executor/device-profiles.js');
  let viewportName = options.mobile ? 'mobile' : options.viewport;
  if (!viewportName || viewportName === 'desktop') {
    viewportName = match.template.defaultViewport || 'desktop';
  }
  if (!validateDeviceProfile(viewportName)) {
    console.error(`Error: Invalid viewport "${viewportName}".`);
    process.exit(1);
  }
  const profile = getDeviceProfile(viewportName);
  if (!profile) {
    console.error(`Error: Could not load device profile for "${viewportName}".`);
    process.exit(1);
  }

  // Determine baseUrl
  let baseUrl: string;
  if (options.demo) {
    baseUrl = 'https://forgeqa.test';
  } else if (options.external) {
    const validation = parseAndValidateBaseUrl(options.baseUrl);
    if (!validation.valid) {
      console.error('Error: Invalid base URL:', validation.warnings.join('; '));
      process.exit(1);
    }
    if (validation.isLikelyProduction && !options.dryRunPlan) {
      console.error('Error: baseUrl appears to be a production domain. Use --dry-run-plan first, or switch to a staging/preview URL.');
      process.exit(1);
    }
    baseUrl = validation.url;
    if (isInteractive && validation.warnings.length > 0) {
      for (const w of validation.warnings) {
        console.warn('Warning:', w);
      }
    }
  } else {
    baseUrl = match.template.baseUrl;
  }

  const context = createPlanContext(match.template, { baseUrl });

  if (s) s.start('Building plan...');
  const plan = buildPlan(match.template, context);
  if (s) s.stop('Plan built.');

  // Build execution policy context
  const mode: ExecutionPolicyContext['mode'] = options.demo ? 'demo' : options.external ? 'external' : 'diagnostic';
  const policyContext: ExecutionPolicyContext = {
    mode,
    strictPolicy: options.strictPolicy,
    allowSubmit: options.allowSubmit,
    allowUpload: options.allowUpload,
    approvedRiskReason: options.approveRisk || undefined,
    template: match.template,
    baseUrl: options.external ? baseUrl : undefined,
  };

  // Evaluate workflow policy before any browser execution
  const policyDecision = evaluateWorkflowPolicy(plan, policyContext);
  const policySummary = buildExecutionPolicySummary(policyContext, policyDecision);

  // Create artifacts dir early for policy preview
  const artifactsDir = createRunArtifactsDir(context.runId);
  writePlan(plan, context.runId);

  // Policy preview: write preview artifacts and exit
  if (options.policyPreview) {
    if (s) s.start('Generating policy preview...');
    const previewMd = generatePolicyPreviewMarkdown(prompt, plan, policyContext, policyDecision);
    fs.writeFileSync(path.join(artifactsDir, 'execution-policy-preview.md'), previewMd, 'utf-8');
    fs.writeFileSync(path.join(artifactsDir, 'execution-policy-preview.json'), JSON.stringify({ policyContext, policyDecision, policySummary }, null, 2), 'utf-8');
    if (s) s.stop('Policy preview generated.');

    if (options.json) {
      console.log(JSON.stringify({
        runId: context.runId,
        status: 'policy-preview',
        verdict: policyDecision.overallRiskLevel === 'blocked' ? 'not_ready' : policyDecision.overallRiskLevel === 'caution' ? 'needs_human_review' : 'ready_for_demo',
        reportHealth: 'pass',
        artifactPath: `artifacts/runs/${context.runId}`,
        policyPreviewMd: `artifacts/runs/${context.runId}/execution-policy-preview.md`,
        policyPreviewJson: `artifacts/runs/${context.runId}/execution-policy-preview.json`,
        blockedCount: policyDecision.blockedCount,
        cautionCount: policyDecision.cautionCount,
        allowedCount: policyDecision.allowedCount,
        overallRiskLevel: policyDecision.overallRiskLevel,
        mode,
      }, null, 2));
    } else if (options.quiet) {
      console.log(`${context.runId} policy-preview ${policyDecision.overallRiskLevel}`);
    } else {
      p.outro(`Policy preview: ${context.runId}`);
      console.log(`Preview:     artifacts/runs/${context.runId}/execution-policy-preview.md`);
      console.log(`Allowed:     ${policyDecision.allowedCount}`);
      console.log(`Caution:     ${policyDecision.cautionCount}`);
      console.log(`Blocked:     ${policyDecision.blockedCount}`);
    }
    return { runId: context.runId, status: 'policy-preview', verdict: 'needs_human_review', reportHealth: 'pass', artifactPath: `artifacts/runs/${context.runId}` };
  }

  // ─── Preflight Scan ───────────────────────────────────────────────────────
  let preflightScan: AppTestabilityScan | undefined;
  if (options.preflightScan) {
    if (s) s.start('Running preflight testability scan...');

    let scanUrl: string;
    let demoServerHandle: { baseUrl: string; stop(): Promise<void>; isRunning(): boolean } | undefined;
    if (mode === 'demo') {
      const { startIsolatedDemoServer } = await import('../demo/server.js');
      demoServerHandle = await startIsolatedDemoServer();
      const scanRoute = match.template.fixtureRoute ?? match.template.demoRoutes[0] ?? '/';
      scanUrl = `${demoServerHandle.baseUrl}${scanRoute}`;
    } else {
      scanUrl = baseUrl;
    }

    const scanContext = {
      mode: mode === 'demo' ? 'demo' as const : 'external' as const,
      baseUrl: mode === 'external' ? baseUrl : undefined,
      viewport: viewportName,
      isMobile: profile.isMobile,
      templateId: match.template.id,
    };

    const { scan, browser } = await runAppTestabilityScan(scanUrl, scanContext);
    preflightScan = scan;

    if (demoServerHandle) {
      await demoServerHandle.stop();
    }

    // Write preflight scan artifacts into the run directory
    const preflightDir = path.join(artifactsDir, 'preflight-scan');
    fs.mkdirSync(preflightDir, { recursive: true });
    const templateRecs = recommendTemplates(scan.findings);
    scan.suggestedTemplates = templateRecs;

    const preflightMd = generateScanMarkdown(scan, templateRecs);
    const preflightHtml = generateScanHtml(scan, templateRecs);
    fs.writeFileSync(path.join(preflightDir, 'scan-result.json'), JSON.stringify(scan, null, 2), 'utf-8');
    fs.writeFileSync(path.join(preflightDir, 'scan-report.md'), preflightMd, 'utf-8');
    fs.writeFileSync(path.join(preflightDir, 'scan-report.html'), preflightHtml, 'utf-8');

    await browser.close();
    if (s) s.stop('Preflight scan complete.');

    if (scan.status === 'fail' && !options.approveRisk) {
      if (s) s.stop('Critical scan findings blocked execution.');
      console.error('Error: Preflight scan found critical testability issues.');
      console.error('Use --approve-risk "<reason>" to proceed despite these findings.');
      if (options.json) {
        console.log(JSON.stringify({
          runId: context.runId,
          status: 'blocked',
          verdict: 'not_ready',
          reason: 'Preflight scan critical findings',
          scanId: scan.scanId,
          scanStatus: scan.status,
          scanScore: scan.score.overall,
        }));
      }
      process.exit(1);
    }

    if (scan.status === 'warn' || scan.status === 'needs_human_review') {
      if (s) s.stop('Preflight scan completed with warnings.');
    }
  }

  if (s) s.start('Generating golden data...');
  const data = generateGoldenData({
    runId: context.runId,
    e2eRunId: context.e2eRunId,
    templateId: match.template.id,
    userCount: 1,
  });
  if (s) s.stop('Golden data generated.');

  writeData(data, context.runId);

  // Build navigation policy for external mode
  const policyFindings: PatternFinding[] = [];
  let policy = null;
  if (options.external) {
    policy = createNavigationPolicy(baseUrl, options.allowHost);

    for (const step of plan.steps) {
      if (step.action === 'navigate' && step.target) {
        const resolved = resolveWorkflowUrl(step.target, baseUrl);
        const navCheck = isAllowedNavigation(resolved, policy);
        if (!navCheck.allowed) {
          policyFindings.push({
            patternId: 'external_url_blocked',
            message: `Step "${step.description}" blocked: ${navCheck.reason ?? 'unknown'}`,
            severity: 'warning',
            evidence: `resolvedUrl=${resolved}, stepId=${step.id}`,
          });
        }
        if (navCheck.warning) {
          policyFindings.push({
            patternId: 'external_host_requires_allowlist',
            message: navCheck.warning,
            severity: 'warning',
            evidence: `resolvedUrl=${resolved}, stepId=${step.id}`,
          });
        }
      }
    }

    if (parseAndValidateBaseUrl(baseUrl).isLikelyProduction) {
      policyFindings.push({
        patternId: 'likely_production_target',
        message: `baseUrl "${baseUrl}" appears to be a production domain.`,
        severity: 'error',
        evidence: `baseUrl=${baseUrl}`,
      });
    }
  }

  const manifest: RunManifest = {
    runId: context.runId,
    e2eRunId: context.e2eRunId,
    templateId: match.template.id,
    status: 'planned',
    startedAt: new Date().toISOString(),
    steps: [],
    artifactsDir: `artifacts/runs/${context.runId}`,
    isFinalized: false,
    policyDecisions: policyDecision.stepDecisions,
    executionPolicy: policySummary,
  };
  writeRunManifest(manifest, context.runId);
  if (s) s.stop('Artifacts created.');

  // Dry-run plan: generate preview, skip browser
  if (options.dryRunPlan) {
    if (s) s.start('Generating dry-run preview...');

    const previewLines: string[] = [];
    previewLines.push('# ForgeQA External Run Preview');
    previewLines.push('');
    previewLines.push(`**Prompt:** ${prompt}`);
    previewLines.push(`**Template:** ${match.template.name} (${match.template.id})`);
    previewLines.push(`**Base URL:** ${baseUrl}`);
    previewLines.push(`**Mode:** ${options.demo ? 'demo' : options.external ? 'external' : 'standard'}`);
    previewLines.push('');
    previewLines.push('## Resolved URLs');
    for (const step of plan.steps) {
      if (step.action === 'navigate' && step.target) {
        const resolved = resolveWorkflowUrl(step.target, baseUrl);
        previewLines.push(`- ${step.description}: \`${resolved}\``);
      }
    }
    previewLines.push('');
    previewLines.push('## Allowed Hosts');
    if (policy) {
      for (const host of policy.allowedHosts) {
        previewLines.push(`- ${host}`);
      }
    }
    previewLines.push('');
    previewLines.push('## Policy Findings');
    if (policyFindings.length === 0) {
      previewLines.push('*No policy findings.*');
    } else {
      for (const f of policyFindings) {
        const icon = f.severity === 'error' ? 'Error' : 'Warning';
        previewLines.push(`- ${icon} **${f.patternId}**: ${f.message}`);
      }
    }
    previewLines.push('');
    previewLines.push('## Actions That Would Run');
    for (const step of plan.steps) {
      previewLines.push(`- [${step.action}] ${step.description}${step.target ? ` -> ${step.target}` : ''}`);
    }
    previewLines.push('');
    previewLines.push('## Safety Disclaimer');
    previewLines.push('This is a dry-run preview only. No browser was launched, no forms were submitted, no uploads occurred.');
    previewLines.push('');
    previewLines.push('## Next Command');
    previewLines.push(`To execute after review, run:`);
    previewLines.push('');
    previewLines.push('```');
    const allowHosts = options.allowHost.length > 0 ? ` ${options.allowHost.map((h) => `--allow-host ${h}`).join(' ')}` : '';
    previewLines.push(`pnpm exec tsx src/cli.ts run "${prompt}" --external --base-url ${baseUrl}${allowHosts}`);
    previewLines.push('```');
    previewLines.push('');

    const previewMd = previewLines.join('\n');
    fs.writeFileSync(path.join(artifactsDir, 'external-run-preview.md'), previewMd, 'utf-8');

    const dryRunManifest: RunManifest = {
      ...manifest,
      status: 'completed',
      isFinalized: true,
      dryRun: true,
      viewport: profile ? {
        profile: profile.name,
        width: profile.width,
        height: profile.height,
        isMobile: profile.isMobile,
        hasTouch: profile.hasTouch,
        deviceScaleFactor: profile.deviceScaleFactor,
      } : undefined,
      completedAt: new Date().toISOString(),
      steps: plan.steps.map((step) => ({
        stepId: step.id,
        status: 'skipped' as const,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 0,
      })),
    };
    writeRunManifest(dryRunManifest, context.runId);

    const cleanupReport = analyzeCleanup(data);
    const cleanupMd = generateCleanupMarkdown(cleanupReport);
    writeCleanupReport(cleanupMd, context.runId);

    const dataAudit = runDataSafetyAudit(data, artifactsDir);
    writeDataSafetyAudit(JSON.stringify(dataAudit, null, 2), context.runId);
    writeDataSafetyAuditMarkdown(generateDataSafetyAuditMarkdown(dataAudit), context.runId);

    // Fixture validation
    let fixtureValidation: FixtureValidationResult | undefined;
    if (match.template.fixtureRoute || match.template.demoRoutes.length > 0) {
      const route = match.template.fixtureRoute ?? match.template.demoRoutes[0];
      const { ROUTE_MAP } = await import('../demo/server.js');
      const fixtureFile = ROUTE_MAP[route] ?? route.replace(/^\//, '') + '.html';
      const fixturePath = path.join(process.cwd(), 'fixtures', 'demo-target', fixtureFile);
      fixtureValidation = validateFixtureFile(fixturePath, match.template.requiredFixtureTestIds ?? [], {
        expectedMissingSelectors: match.template.expectedMissingSelectors,
        fixtureValidationMode: match.template.fixtureValidationMode ?? 'strict',
        route,
      });
      fs.writeFileSync(path.join(artifactsDir, 'fixture-validation.json'), JSON.stringify(fixtureValidation, null, 2), 'utf-8');
      fs.writeFileSync(path.join(artifactsDir, 'fixture-validation.md'), generateFixtureValidationMarkdown(fixtureValidation), 'utf-8');
    }

    const validation = validateRunArtifacts(artifactsDir, dryRunManifest);
    writeArtifactValidation(JSON.stringify(validation, null, 2), context.runId);

    const verdict = 'needs_human_review';
    const reportMd = generateMarkdownReport({
      prompt,
      plan,
      data,
      manifest: dryRunManifest,
      runDir: artifactsDir,
      verdict,
      findings: policyFindings,
      validation,
      fixtureValidation,
      template: match.template,
      preflightScan,
    });
    writeReportMarkdown(reportMd, context.runId);

    const reportHtml = generateHtmlReport({
      prompt,
      plan,
      data,
      manifest: dryRunManifest,
      runDir: artifactsDir,
      verdict,
      findings: policyFindings,
      validation,
      fixtureValidation,
      template: match.template,
      preflightScan,
    });
    writeReportHtml(reportHtml, context.runId);

    const artifactManifest = generateArtifactManifest(artifactsDir, dryRunManifest, validation);
    writeArtifactManifest(JSON.stringify(artifactManifest, null, 2), context.runId);

    if (s) s.stop('Dry-run preview generated.');

    if (options.json) {
      console.log(JSON.stringify({
        runId: context.runId,
        status: 'dry-run',
        verdict,
        reportHealth: 'pass',
        artifactPath: `artifacts/runs/${context.runId}`,
        previewMd: `artifacts/runs/${context.runId}/external-run-preview.md`,
        policyFindings: policyFindings.length,
        mode: 'dry-run-plan',
        viewport: profile ? {
          profile: profile.name,
          width: profile.width,
          height: profile.height,
          isMobile: profile.isMobile,
        } : undefined,
      }, null, 2));
    } else if (options.quiet) {
      console.log(`${context.runId} dry-run needs_human_review`);
    } else {
      p.outro(`Dry-run preview: ${context.runId}`);
      console.log(`Preview:     artifacts/runs/${context.runId}/external-run-preview.md`);
      if (policyFindings.length > 0) {
        console.log(`Policy findings: ${policyFindings.length}`);
      }
    }
    return { runId: context.runId, status: 'dry-run', verdict, reportHealth: 'pass', artifactPath: `artifacts/runs/${context.runId}` };
  }

  if (s) s.start('Executing workflow in browser...');
  const result = await execute({
    plan,
    data,
    runId: context.runId,
    demo: options.demo,
    external: options.external,
    baseUrl,
    allowHosts: options.allowHost,
    viewport: viewportName,
    artifactsDir,
    policyContext,
    policyDecision,
  });
  if (s) s.stop('Execution complete.');

  const finalizedManifest = finalizeRunManifest(result, context.runId);

  if (s) s.start('Generating reports...');
  const verdict = computeReadinessVerdict(finalizedManifest);
  const patternAnalysis = analyzePatterns(plan, data, finalizedManifest);

  // Deduplicate pattern findings with DOM findings and policy findings
  const dedupedFindings = mergePatternAndDomFindings(
    [...patternAnalysis.findings, ...policyFindings],
    finalizedManifest.domFindings ?? [],
  );

  // Scope analysis, failure classification, and evidence gallery
  if (s) s.start('Generating scope analysis...');
  const scopeAnalysis = analyzeScope(match.template, plan, finalizedManifest);
  writeScopeAnalysis(JSON.stringify(scopeAnalysis, null, 2), context.runId);
  writeScopeAnalysisMarkdown(generateScopeAnalysisMarkdown(scopeAnalysis), context.runId);
  if (s) s.stop('Scope analysis complete.');

  if (s) s.start('Generating failure classification...');
  const failureClassification = classifyFailures(match.template, plan, finalizedManifest);
  writeFailureClassification(JSON.stringify(failureClassification, null, 2), context.runId);
  writeFailureClassificationMarkdown(generateFailureClassificationMarkdown(failureClassification), context.runId);
  if (s) s.stop('Failure classification complete.');

  if (s) s.start('Generating screenshot gallery...');
  const galleryData = buildGalleryData(plan, finalizedManifest, artifactsDir, verdict, 'pending');
  writeScreenshotGalleryHtml(generateGalleryHtml(galleryData), context.runId);
  writeScreenshotGalleryMarkdown(generateGalleryMarkdown(galleryData), context.runId);
  writeScreenshotGalleryJson(JSON.stringify(galleryData, null, 2), context.runId);
  if (s) s.stop('Screenshot gallery complete.');

  // Generate initial reports (before validation)
  const reportMd = generateMarkdownReport({
    prompt,
    plan,
    data,
    manifest: finalizedManifest,
    runDir: artifactsDir,
    verdict,
    findings: dedupedFindings,
    template: match.template,
    scopeAnalysis,
    failureClassification,
    galleryData,
    preflightScan,
  });
  writeReportMarkdown(reportMd, context.runId);

  const reportHtml = generateHtmlReport({
    prompt,
    plan,
    data,
    manifest: finalizedManifest,
    runDir: artifactsDir,
    verdict,
    findings: dedupedFindings,
    template: match.template,
    scopeAnalysis,
    failureClassification,
    galleryData,
    preflightScan,
  });
  writeReportHtml(reportHtml, context.runId);

  const cleanupReport = analyzeCleanup(data);
  const cleanupMd = generateCleanupMarkdown(cleanupReport);
  writeCleanupReport(cleanupMd, context.runId);

  // Data safety audit
  if (s) s.start('Running data safety audit...');
  const dataAudit = runDataSafetyAudit(data, artifactsDir);
  writeDataSafetyAudit(JSON.stringify(dataAudit, null, 2), context.runId);
  writeDataSafetyAuditMarkdown(generateDataSafetyAuditMarkdown(dataAudit), context.runId);
  if (s) s.stop('Data safety audit complete.');

  // Industry pack assessment
  let industryAssessment: IndustryPackAssessment | undefined;
  if (options.industry) {
    const pack = getIndustryPackById(options.industry);
    if (pack) {
      if (s) s.start('Generating industry readiness assessment...');
      industryAssessment = assessIndustryReadiness(pack, {
        scan: preflightScan,
        runManifest: finalizedManifest,
        scopeAnalysis,
        failureClassification,
        policyFindings: policyDecision.stepDecisions.map((d) => ({
          patternId: d.reasonCode,
          message: d.message,
          severity: d.riskLevel,
        })),
        dataSafetyAudit: dataAudit,
      });
      writeIndustryAssessmentMarkdown(generateIndustryAssessmentMarkdown(industryAssessment), context.runId);
      writeIndustryAssessmentJson(generateIndustryAssessmentJson(industryAssessment), context.runId);
      if (s) s.stop('Industry assessment complete.');
    }
  }

  // Fixture validation
  let fixtureValidation: FixtureValidationResult | undefined;
  if (match.template.fixtureRoute || match.template.demoRoutes.length > 0) {
    if (s) s.start('Validating fixture...');
    const route = match.template.fixtureRoute ?? match.template.demoRoutes[0];
    const { ROUTE_MAP } = await import('../demo/server.js');
    const fixtureFile = ROUTE_MAP[route] ?? route.replace(/^\//, '') + '.html';
    const fixturePath = path.join(process.cwd(), 'fixtures', 'demo-target', fixtureFile);
    fixtureValidation = validateFixtureFile(fixturePath, match.template.requiredFixtureTestIds ?? [], {
      expectedMissingSelectors: match.template.expectedMissingSelectors,
      fixtureValidationMode: match.template.fixtureValidationMode ?? 'strict',
      route,
    });
    fs.writeFileSync(path.join(artifactsDir, 'fixture-validation.json'), JSON.stringify(fixtureValidation, null, 2), 'utf-8');
    fs.writeFileSync(path.join(artifactsDir, 'fixture-validation.md'), generateFixtureValidationMarkdown(fixtureValidation), 'utf-8');
    if (s) s.stop('Fixture validation complete.');
  }

  if (s) s.stop('Reports generated.');

  // Artifact validation
  if (s) s.start('Validating artifacts...');
  const validation = validateRunArtifacts(artifactsDir, finalizedManifest);
  writeArtifactValidation(JSON.stringify(validation, null, 2), context.runId);

  // Regenerate reports with validation and fixture data
  const reportMdValidated = generateMarkdownReport({
    prompt,
    plan,
    data,
    manifest: finalizedManifest,
    runDir: artifactsDir,
    verdict,
    findings: dedupedFindings,
    validation,
    fixtureValidation,
    template: match.template,
    scopeAnalysis,
    failureClassification,
    galleryData,
    preflightScan,
    industryAssessment,
  });
  writeReportMarkdown(reportMdValidated, context.runId);

  const reportHtmlValidated = generateHtmlReport({
    prompt,
    plan,
    data,
    manifest: finalizedManifest,
    runDir: artifactsDir,
    verdict,
    findings: dedupedFindings,
    validation,
    fixtureValidation,
    template: match.template,
    scopeAnalysis,
    failureClassification,
    galleryData,
    preflightScan,
    industryAssessment,
  });
  writeReportHtml(reportHtmlValidated, context.runId);

  // Generate artifact manifest
  const artifactManifest = generateArtifactManifest(artifactsDir, finalizedManifest, validation);
  writeArtifactManifest(JSON.stringify(artifactManifest, null, 2), context.runId);

  if (s) s.stop('Validation complete.');

  // Add rerun metadata if applicable
  if (rerunMeta) {
    const rerunRunJsonPath = path.join(artifactsDir, 'run.json');
    if (fs.existsSync(rerunRunJsonPath)) {
      const rerunManifest = JSON.parse(fs.readFileSync(rerunRunJsonPath, 'utf-8'));
      rerunManifest.originalRunId = rerunMeta.originalRunId;
      rerunManifest.rerunOf = rerunMeta.originalRunId;
      rerunManifest.rerunCreatedAt = new Date().toISOString();
      fs.writeFileSync(rerunRunJsonPath, JSON.stringify(rerunManifest, null, 2), 'utf-8');
    }
    // Update report.md with rerun context
    const reportMdPath = path.join(artifactsDir, 'report.md');
    if (fs.existsSync(reportMdPath)) {
      const existingMd = fs.readFileSync(reportMdPath, 'utf-8');
      const rerunContext = `## Rerun Context\n\n- **Original Run ID:** \`${rerunMeta.originalRunId}\`\n- **New Run ID:** \`${context.runId}\`\n- **Rerun Created At:** ${new Date().toISOString()}\n\n`;
      fs.writeFileSync(reportMdPath, rerunContext + existingMd, 'utf-8');
    }
    // Update report.html with rerun context
    const reportHtmlPath = path.join(artifactsDir, 'report.html');
    if (fs.existsSync(reportHtmlPath)) {
      const existingHtml = fs.readFileSync(reportHtmlPath, 'utf-8');
      const rerunHtml = `<div class="card"><h2>Rerun Context</h2><table><tr><th>Field</th><th>Value</th></tr><tr><td>Original Run ID</td><td><code>${rerunMeta.originalRunId}</code></td></tr><tr><td>New Run ID</td><td><code>${context.runId}</code></td></tr><tr><td>Rerun Created At</td><td>${new Date().toISOString()}</td></tr></table></div>`;
      const insertBefore = '<div class="card">\n    <h2>Executive Summary</h2>';
      const updatedHtml = existingHtml.replace(insertBefore, rerunHtml + '\n' + insertBefore);
      fs.writeFileSync(reportHtmlPath, updatedHtml, 'utf-8');
    }
  }

  const artifacts = listArtifacts(context.runId);
  const screenshotCount = artifacts.filter((a) => a.includes('screenshots/') && a.endsWith('.png')).length;
  const hasTrace = artifacts.some((a) => a === 'trace.zip');
  const failCount = validation.checks.filter((c) => c.status === 'fail').length;
  const warnCount = validation.checks.filter((c) => c.status === 'warn').length;
  const healthStatus = failCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : 'pass';

  if (options.json) {
    const jsonOutput: Record<string, unknown> = {
      runId: context.runId,
      status: finalizedManifest.status,
      verdict,
      reportHealth: healthStatus,
      artifactPath: `artifacts/runs/${context.runId}`,
      reportHtml: `artifacts/runs/${context.runId}/report.html`,
      reportMarkdown: `artifacts/runs/${context.runId}/report.md`,
      validationFindings: validation.findings.length,
      screenshotCount,
      traceZip: hasTrace,
      patternFindings: dedupedFindings.length,
      domFindings: (finalizedManifest.domFindings ?? []).length,
      viewport: finalizedManifest.viewport ? {
        profile: finalizedManifest.viewport.profile,
        width: finalizedManifest.viewport.width,
        height: finalizedManifest.viewport.height,
        isMobile: finalizedManifest.viewport.isMobile,
      } : undefined,
    };
    if (options.validate) {
      jsonOutput.validationStatus = healthStatus;
      jsonOutput.validationCheckCount = validation.checks.length;
      jsonOutput.validationWarnings = warnCount;
      jsonOutput.validationFailures = failCount;
      jsonOutput.validationArtifactPath = `artifacts/runs/${context.runId}/artifact-validation.json`;
    }
    console.log(JSON.stringify(jsonOutput, null, 2));
  } else if (options.quiet) {
    console.log(`${context.runId} ${finalizedManifest.status} ${verdict}`);
  } else {
    p.outro(`Run complete: ${context.runId}`);
    console.log(`Status:      ${finalizedManifest.status}`);
    console.log(`Verdict:     ${verdict}`);
    console.log(`Health:      ${healthStatus === 'pass' ? 'pass' : healthStatus === 'warn' ? 'warn' : 'fail'} (${validation.checks.length} checks, ${failCount} failures, ${warnCount} warnings)`);
    console.log(`Artifacts:   artifacts/runs/${context.runId}/`);
    console.log(`Report MD:   artifacts/runs/${context.runId}/report.md`);
    console.log(`Report HTML: artifacts/runs/${context.runId}/report.html`);
    console.log(`Cleanup:     artifacts/runs/${context.runId}/cleanup-report.md`);
    console.log(`Validation:  artifacts/runs/${context.runId}/artifact-validation.json`);
    console.log(`Manifest:    artifacts/runs/${context.runId}/artifact-manifest.json`);
    console.log(`Screenshots: ${screenshotCount}`);
    if (hasTrace) {
      console.log(`Trace:       artifacts/runs/${context.runId}/trace.zip`);
    }
    if (options.verbose) {
      console.log(`Pattern findings: ${dedupedFindings.length}`);
      console.log(`DOM findings: ${(finalizedManifest.domFindings ?? []).length}`);
      console.log(`Validation findings: ${validation.findings.length}`);
    }
    if (validation.findings.length > 0) {
      console.log(`Validation findings: ${validation.findings.length}`);
    }
    if (finalizedManifest.status === 'failed') {
      const failedSteps = finalizedManifest.steps.filter((s: { status: string }) => s.status === 'failed');
      console.log(`Failed:      ${failedSteps.length} step(s)`);
      for (const fs of failedSteps) {
        console.log(`  - ${fs.stepId}: ${fs.error ?? 'unknown error'}`);
      }
      process.exit(1);
    }
  }

  // Strict validation exit
  if (options.validate && options.strict && (warnCount > 0 || failCount > 0)) {
    process.exit(1);
  }

  return {
    runId: context.runId,
    status: finalizedManifest.status,
    verdict,
    reportHealth: healthStatus,
    artifactPath: `artifacts/runs/${context.runId}`,
  };
}
