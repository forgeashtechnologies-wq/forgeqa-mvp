import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import type { WorkflowPlan, GoldenDataSet, RunManifest, StepResult, WorkflowStep } from '../schemas/core.js';
import { writeRunManifest, getRunDir } from '../artifacts/manager.js';
import { startDemoServer, stopDemoServer } from '../demo/server.js';
import { analyzeDom } from './dom-analyzer.js';
import type { PatternFinding } from '../patterns/types.js';
import {
  createNavigationPolicy,
  isAllowedNavigation,
  resolveWorkflowUrl,
} from '../policy/url-policy.js';
import { getDeviceProfile } from './device-profiles.js';
import type { ExecutionPolicyContext, WorkflowPolicyDecision, StepPolicyDecision } from '../policy/execution-policy.js';
import { evaluateStepPolicy } from '../policy/execution-policy.js';
import { enrichFinding } from '../patterns/analyzer.js';

export interface ExecutorOptions {
  plan: WorkflowPlan;
  data: GoldenDataSet;
  runId: string;
  demo: boolean;
  external?: boolean;
  baseUrl?: string;
  demoBaseUrl?: string;
  allowHosts?: string[];
  viewport?: string;
  artifactsDir: string;
  policyContext?: ExecutionPolicyContext;
  policyDecision?: WorkflowPolicyDecision;
}

function isAllowedInDemo(url: string): boolean {
  if (url.startsWith('/')) return true;
  if (url.startsWith('file://')) return true;
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function resolveDemoUrl(url: string, demoBaseUrl: string): string {
  if (url.startsWith('/')) {
    return demoBaseUrl + url;
  }
  return url;
}

function resolveFillValue(step: WorkflowStep, data: GoldenDataSet): string {
  const user = data.users[0];
  if (!user) return 'test-value';

  const target = step.target || '';
  if (target.includes('email')) return user.email;
  if (target.includes('password')) return user.password;
  if (target.includes('name')) return user.displayName;
  if (target.includes('department')) return user.department ?? 'Computer Science';
  if (target.includes('batch')) return user.batch ?? '2018';
  if (target.includes('bio')) return 'ForgeQA test bio';

  return step.value ?? 'test-value';
}

interface UploadFileInfo {
  path: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256?: string;
}

function resolveUploadFile(_step: WorkflowStep, data: GoldenDataSet, runId: string): UploadFileInfo {
  const file = data.files[0];
  const filesDir = path.join(getRunDir(runId), 'files');
  fs.mkdirSync(filesDir, { recursive: true });

  if (file) {
    const filePath = path.join(filesDir, file.filename);
    fs.writeFileSync(filePath, file.content ?? Buffer.alloc(1024, 0));
    return {
      path: filePath,
      filename: file.filename,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
    };
  }

  const dummyPath = path.join(filesDir, 'dummy-avatar.png');
  const dummyContent = Buffer.alloc(1024, 0);
  fs.writeFileSync(dummyPath, dummyContent);
  return {
    path: dummyPath,
    filename: 'dummy-avatar.png',
    mimeType: 'image/png',
    sizeBytes: dummyContent.length,
  };
}

export async function execute(options: ExecutorOptions): Promise<RunManifest> {
  const { plan, data, runId, demo, external, baseUrl, demoBaseUrl: injectedDemoBaseUrl, allowHosts, viewport, artifactsDir, policyDecision } = options;
  const screenshotsDir = path.join(artifactsDir, 'screenshots');
  const tracePath = path.join(artifactsDir, 'trace.zip');

  const profile = getDeviceProfile(viewport || 'desktop');
  const manifest: RunManifest = {
    runId,
    e2eRunId: data.e2eRunId,
    templateId: plan.templateId,
    status: 'running',
    startedAt: new Date().toISOString(),
    steps: [],
    artifactsDir,
    isFinalized: false,
    viewport: profile ? {
      profile: profile.name,
      width: profile.width,
      height: profile.height,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
      deviceScaleFactor: profile.deviceScaleFactor,
    } : undefined,
    policyDecisions: policyDecision?.stepDecisions,
    executionPolicy: options.policyContext ? {
      mode: options.policyContext.mode,
      strictPolicy: options.policyContext.strictPolicy,
      allowSubmit: options.policyContext.allowSubmit,
      allowUpload: options.policyContext.allowUpload,
      approvedRiskReason: options.policyContext.approvedRiskReason,
      blockedCount: policyDecision?.blockedCount ?? 0,
      cautionCount: policyDecision?.cautionCount ?? 0,
      allowedCount: policyDecision?.allowedCount ?? 0,
    } : undefined,
  };

  let demoBaseUrl = '';
  let managedDemoServer = false;
  if (demo) {
    if (injectedDemoBaseUrl) {
      demoBaseUrl = injectedDemoBaseUrl;
    } else {
      try {
        const port = await startDemoServer();
        demoBaseUrl = `http://127.0.0.1:${port}`;
        managedDemoServer = true;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        manifest.status = 'failed';
        manifest.steps.push({
          stepId: 'demo-server-start',
          status: 'failed',
          error: `demo_server_failed: ${error}`,
          startedAt: manifest.startedAt,
          completedAt: new Date().toISOString(),
        });
        writeRunManifest(manifest, runId);
        return manifest;
      }
    }
  }

  // Build navigation policy for external mode
  const policy = external && baseUrl ? createNavigationPolicy(baseUrl, allowHosts) : null;
  const policyFindings: PatternFinding[] = [];

  let browser;
  let context;
  let page: import('playwright').Page | undefined;
  let traceStarted = false;
  const domFindings: PatternFinding[] = [];

  async function runDomAnalysis(stepId: string, stepIndex: number, action?: string, selector?: string, expectedText?: string) {
    if (!page) return;
    try {
      const url = page.url();
      const findings = await analyzeDom(page, {
        runId,
        stepId,
        stepIndex,
        currentUrl: url,
        action,
        selector,
        expectedText,
      });
      for (const f of findings) {
        // deduplicate by patternId + stepId + evidence
        const key = `${f.patternId}|${f.stepId ?? ''}|${f.evidence ?? f.message}`;
        const exists = domFindings.some((d) => `${d.patternId}|${d.stepId ?? ''}|${d.evidence ?? d.message}` === key);
        if (!exists) {
          domFindings.push(f);
        }
      }
    } catch {
      // ignore DOM analysis failures
    }
  }

  try {
    browser = await chromium.launch({ headless: true });
    const contextOptions: import('playwright').BrowserContextOptions = {};
    if (profile) {
      contextOptions.viewport = { width: profile.width, height: profile.height };
      contextOptions.isMobile = profile.isMobile;
      contextOptions.hasTouch = profile.hasTouch;
      contextOptions.deviceScaleFactor = profile.deviceScaleFactor;
    }
    context = await browser.newContext(contextOptions);
    await context.tracing.start({ screenshots: true, snapshots: true });
    traceStarted = true;
    page = await context.newPage();
    page.setDefaultTimeout(5000);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    manifest.status = 'failed';
    manifest.steps.push({
      stepId: 'browser-launch',
      status: 'failed',
      error: `browser_launch_failed: ${error}`,
      startedAt: manifest.startedAt,
      completedAt: new Date().toISOString(),
    });
    writeRunManifest(manifest, runId);
    if (demo && managedDemoServer) {
      await stopDemoServer();
    }
    return manifest;
  }

  // Enforce execution policy for each step
  const policyDecisions: StepPolicyDecision[] = [];
  const policyFindingsEnforced: PatternFinding[] = [];

  try {
    let stoppedEarly = false;
    for (let stepIndex = 0; stepIndex < plan.steps.length; stepIndex++) {
      const step = plan.steps[stepIndex];

      // Evaluate step policy before execution
      let stepPolicy: StepPolicyDecision;
      if (options.policyContext) {
        stepPolicy = evaluateStepPolicy(step, stepIndex, options.policyContext);
      } else {
        stepPolicy = options.policyDecision?.stepDecisions[stepIndex] ?? {
          allowed: true,
          riskLevel: 'safe',
          reasonCode: 'no_policy_context',
          message: 'No policy context provided; step allowed by default.',
          stepId: step.id,
          stepIndex,
          action: step.action,
        };
      }
      policyDecisions.push(stepPolicy);

      if (!stepPolicy.allowed) {
        const blockedResult: StepResult = {
          stepId: step.id,
          status: 'failed',
          error: `POLICY_BLOCKED: ${stepPolicy.message}`,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 0,
        };
        manifest.steps.push(blockedResult);
        policyFindingsEnforced.push(enrichFinding({
          patternId: stepPolicy.reasonCode,
          message: stepPolicy.message,
          severity: 'warning',
          stepId: step.id,
          evidence: stepPolicy.evidence,
        }));
        writeRunManifest({ ...manifest, policyDecisions, policyFindings: policyFindingsEnforced }, runId);
        if (!step.continueOnFailure) {
          stoppedEarly = true;
        }
        continue;
      }

      if (stoppedEarly) {
        const skippedResult: StepResult = {
          stepId: step.id,
          status: 'skipped',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 0,
        };
        manifest.steps.push(skippedResult);
        writeRunManifest(manifest, runId);
        continue;
      }

      const stepResult: StepResult = {
        stepId: step.id,
        status: 'running',
        startedAt: new Date().toISOString(),
      };

      try {
        if (step.action === 'navigate') {
          const url = step.target || '';
          if (demo && !isAllowedInDemo(url)) {
            throw new Error(`Demo mode blocked external URL: ${url}`);
          }
          let resolvedUrl = url;
          if (demo) {
            resolvedUrl = resolveDemoUrl(url, demoBaseUrl);
          } else if (external && baseUrl) {
            resolvedUrl = resolveWorkflowUrl(url, baseUrl);
            if (policy) {
              const navCheck = isAllowedNavigation(resolvedUrl, policy);
              if (!navCheck.allowed) {
                policyFindings.push({
                  patternId: 'external_url_blocked',
                  message: `Navigation blocked: ${navCheck.reason ?? 'unknown'}`,
                  severity: 'warning',
                  evidence: `resolvedUrl=${resolvedUrl}, stepId=${step.id}`,
                });
                throw new Error(`External mode blocked navigation: ${navCheck.reason ?? 'unknown'}`);
              }
            }
          }
          await page.goto(resolvedUrl);
          await runDomAnalysis(step.id, step.order, 'navigate');
        } else if (step.action === 'fill') {
          const value = resolveFillValue(step, data);
          await page.fill(step.target || '', value);
        } else if (step.action === 'click') {
          await page.click(step.target || '');
        } else if (step.action === 'upload') {
          const fileInfo = resolveUploadFile(step, data, runId);
          await page.setInputFiles(step.target || '', fileInfo.path);
          stepResult.snapshotHtml = JSON.stringify({
            uploadedFile: {
              relativePath: path.relative(artifactsDir, fileInfo.path),
              filename: fileInfo.filename,
              mimeType: fileInfo.mimeType,
              sizeBytes: fileInfo.sizeBytes,
              sha256: fileInfo.sha256 ?? null,
            },
          });
        } else if (step.action === 'assertVisible') {
          await page.waitForSelector(step.target || '', { state: 'visible', timeout: 5000 });
          await runDomAnalysis(step.id, step.order, 'assertVisible', step.target || '');
        } else if (step.action === 'assertHidden') {
          try {
            await page.waitForSelector(step.target || '', { state: 'hidden', timeout: 5000 });
          } catch {
            // If waitForSelector hidden times out, element may be attached but not visible
            const visible = await page.locator(step.target || '').isVisible().catch(() => true);
            if (visible) {
              throw new Error(`Expected element to be hidden but it was visible: ${step.target}`);
            }
          }
          await runDomAnalysis(step.id, step.order, 'assertHidden', step.target || '');
        } else if (step.action === 'assertText') {
          const text = await page.textContent(step.target || '');
          if (!text?.includes(step.value || '')) {
            throw new Error(`Expected text containing "${step.value}" but got "${text}"`);
          }
        } else if (step.action === 'wait') {
          const ms = parseInt(step.value || '0', 10);
          await page.waitForTimeout(ms);
        } else if (step.action === 'screenshot') {
          const ssPath = path.join(screenshotsDir, `${step.id}.png`);
          await page.screenshot({ path: ssPath });
          stepResult.screenshotPath = ssPath;
        } else if (step.action === 'stop') {
          stepResult.status = 'passed';
          stoppedEarly = true;
        }

        if (step.screenshot && !stepResult.screenshotPath) {
          const ssPath = path.join(screenshotsDir, `${step.id}.png`);
          await page.screenshot({ path: ssPath });
          stepResult.screenshotPath = ssPath;
        }

        if (stepResult.status !== 'passed') {
          stepResult.status = 'passed';
        }
      } catch (err) {
        stepResult.status = 'failed';
        stepResult.error = err instanceof Error ? err.message : String(err);
        try {
          const ssPath = path.join(screenshotsDir, `${step.id}-failure.png`);
          await page.screenshot({ path: ssPath });
          stepResult.screenshotPath = ssPath;
        } catch {
          // ignore screenshot failure on top of step failure
        }
        // Run DOM analysis on failure to inspect the state that caused the failure
        await runDomAnalysis(step.id, step.order, step.action, step.target || '', step.value);
        if (!step.continueOnFailure) {
          stoppedEarly = true;
        }
      }

      stepResult.completedAt = new Date().toISOString();
      stepResult.durationMs = new Date(stepResult.completedAt).getTime() - new Date(stepResult.startedAt ?? stepResult.completedAt).getTime();
      manifest.steps.push(stepResult);
      writeRunManifest(manifest, runId);
    }

    manifest.status = manifest.steps.some((s: { status: string }) => s.status === 'failed') ? 'failed' : 'completed';

    // Final DOM analysis on the last page state
    if (page && !stoppedEarly) {
      await runDomAnalysis('final-state', plan.steps.length, 'final');
    }
  } catch (err) {
    manifest.status = 'failed';
    const error = err instanceof Error ? err.message : String(err);
    manifest.steps.push({
      stepId: 'executor-error',
      status: 'failed',
      error: `executor_failed: ${error}`,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
  } finally {
    manifest.domFindings = domFindings;
    manifest.policyDecisions = policyDecisions;
    if (policyFindings.length > 0 || policyFindingsEnforced.length > 0) {
      // Merge policy findings into domFindings for reporting
      const allPolicyFindings = [...policyFindings, ...policyFindingsEnforced];
      for (const pf of allPolicyFindings) {
        const key = `${pf.patternId}|${pf.stepId ?? ''}|${pf.evidence ?? pf.message}`;
        const exists = domFindings.some((d) => `${d.patternId}|${d.stepId ?? ''}|${d.evidence ?? d.message}` === key);
        if (!exists) {
          domFindings.push(pf);
        }
      }
      manifest.domFindings = domFindings;
      manifest.policyFindings = policyFindingsEnforced;
    }
    if (traceStarted && context) {
      await context.tracing.stop({ path: tracePath });
    }
    if (browser) {
      await browser.close();
    }
    if (demo && managedDemoServer) {
      await stopDemoServer();
    }
  }

  writeRunManifest(manifest, runId);
  return manifest;
}
