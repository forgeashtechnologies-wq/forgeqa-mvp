import fs from 'node:fs';
import path from 'node:path';
import type { RunManifest } from '../schemas/core.js';

export interface RunSummary {
  runId: string;
  shortRunId: string;
  templateId: string;
  templateName: string;
  mode: string;
  status: string;
  verdict: string;
  reportHealth: string;
  dataSafetyStatus?: string;
  fixtureValidationStatus?: string;
  artifactIntegrityStatus?: string;
  blockedCount: number;
  cautionCount: number;
  allowedCount: number;
  patternFindings: number;
  domFindings: number;
  policyFindings: number;
  validationFindings: number;
  stepPassCount: number;
  stepFailCount: number;
  stepSkippedCount: number;
  stepBlockedCount: number;
  durationMs: number;
  screenshotCount: number;
  traceZipPresent: boolean;
  dataProfile?: string;
  generatedFileCount: number;
  createdAt: string;
  completedAt?: string;
  runDir: string;
  originalRunId?: string;
  scopeCoveragePercent?: number;
  scopeTestedCount?: number;
  scopeNotTestedCount?: number;
  scopeNeedsHumanReviewCount?: number;
  failureAppBugCount?: number;
  failureTestBugCount?: number;
  failureEnvironmentIssueCount?: number;
  failurePolicyBlockCount?: number;
  failureExpectedDiagnosticCount?: number;
}

const DEFAULT_ARTIFACTS_ROOT = path.resolve(process.cwd(), 'artifacts', 'runs');

export function getRunShortId(runId: string): string {
  return runId.slice(0, 8);
}

export function formatRunTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
}

function readJsonSafe<T>(filePath: string): T | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return undefined;
  }
}

export function readRunSummary(runId: string, artifactsRoot?: string): RunSummary | undefined {
  const root = artifactsRoot ?? DEFAULT_ARTIFACTS_ROOT;
  const runDir = path.join(root, runId);
  if (!fs.existsSync(runDir)) return undefined;

  const manifest = readJsonSafe<RunManifest>(path.join(runDir, 'run.json'));
  if (!manifest) return undefined;

  const artifactManifest = readJsonSafe<Record<string, unknown>>(path.join(runDir, 'artifact-manifest.json'));
  const validation = readJsonSafe<{ reportHealth?: string; checks?: { name: string; status: string }[]; findings?: unknown[] }>(path.join(runDir, 'artifact-validation.json'));
  const audit = readJsonSafe<{ status?: string; profileType?: string }>(path.join(runDir, 'data-safety-audit.json'));

  const screenshotsDir = path.join(runDir, 'screenshots');
  const screenshotCount = fs.existsSync(screenshotsDir) ? fs.readdirSync(screenshotsDir).filter((f) => f.endsWith('.png')).length : 0;
  const traceZipPresent = fs.existsSync(path.join(runDir, 'trace.zip'));

  const verdict = manifest.status === 'failed' ? 'not_ready' :
    manifest.policyDecisions?.some((d) => d.riskLevel === 'blocked') ? 'not_ready' :
    manifest.policyDecisions?.some((d) => d.riskLevel === 'caution') ? 'needs_human_review' :
    'ready_for_demo';

  // Compute reportHealth from validation checks if reportHealth field is not present
  let reportHealth = validation?.reportHealth ?? 'unknown';
  if (reportHealth === 'unknown' && validation?.checks) {
    const failCount = validation.checks.filter((c) => c.status === 'fail').length;
    const warnCount = validation.checks.filter((c) => c.status === 'warn').length;
    reportHealth = failCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : 'pass';
  }

  // Compute fixture validation status
  let fixtureValidationStatus: string | undefined;
  if (fs.existsSync(path.join(runDir, 'fixture-validation.json'))) {
    try {
      const fv = JSON.parse(fs.readFileSync(path.join(runDir, 'fixture-validation.json'), 'utf-8'));
      fixtureValidationStatus = fv.status ?? 'unknown';
    } catch { /* ignore */ }
  }

  // Compute artifact integrity status
  let artifactIntegrityStatus: string | undefined;
  if (validation?.checks) {
    const integrityChecks = validation.checks.filter((c) =>
      c.name === 'artifact manifest integrity' || c.name === 'artifact manifest required artifacts present',
    );
    const integrityFail = integrityChecks.some((c) => c.status === 'fail');
    artifactIntegrityStatus = integrityFail ? 'fail' : 'pass';
  }

  // Step counts
  const steps = manifest.steps ?? [];
  const stepPassCount = steps.filter((s) => s.status === 'passed').length;
  const stepFailCount = steps.filter((s) => s.status === 'failed').length;
  const stepSkippedCount = steps.filter((s) => s.status === 'skipped').length;
  const stepBlockedCount = manifest.policyDecisions?.filter((d) => d.riskLevel === 'blocked').length ?? 0;

  // Duration
  const durationMs = manifest.completedAt && manifest.startedAt
    ? new Date(manifest.completedAt).getTime() - new Date(manifest.startedAt).getTime()
    : 0;

  // Data profile
  const dataProfile = audit?.profileType as string | undefined;

  // Generated file count
  const filesDir = path.join(runDir, 'files');
  const generatedFileCount = fs.existsSync(filesDir) ? fs.readdirSync(filesDir).length : 0;

  return {
    runId,
    shortRunId: getRunShortId(runId),
    templateId: manifest.templateId,
    templateName: artifactManifest?.templateName as string ?? manifest.templateId,
    mode: manifest.executionPolicy?.mode ?? 'unknown',
    status: manifest.status,
    verdict,
    reportHealth,
    dataSafetyStatus: audit?.status,
    fixtureValidationStatus,
    artifactIntegrityStatus,
    blockedCount: manifest.executionPolicy?.blockedCount ?? 0,
    cautionCount: manifest.executionPolicy?.cautionCount ?? 0,
    allowedCount: manifest.executionPolicy?.allowedCount ?? 0,
    patternFindings: manifest.domFindings?.length ?? 0,
    domFindings: manifest.domFindings?.length ?? 0,
    policyFindings: manifest.policyFindings?.length ?? 0,
    validationFindings: validation?.findings?.length ?? 0,
    stepPassCount,
    stepFailCount,
    stepSkippedCount,
    stepBlockedCount,
    durationMs,
    screenshotCount,
    traceZipPresent,
    dataProfile,
    generatedFileCount,
    createdAt: manifest.startedAt,
    completedAt: manifest.completedAt,
    runDir,
    originalRunId: manifest.originalRunId,
    // Scope and failure summaries from new artifacts
    scopeCoveragePercent: readJsonSafe<{ summary?: { coveragePercent?: number } }>(path.join(runDir, 'scope-analysis.json'))?.summary?.coveragePercent,
    scopeTestedCount: readJsonSafe<{ summary?: { testedCount?: number } }>(path.join(runDir, 'scope-analysis.json'))?.summary?.testedCount,
    scopeNotTestedCount: readJsonSafe<{ summary?: { notTestedCount?: number } }>(path.join(runDir, 'scope-analysis.json'))?.summary?.notTestedCount,
    scopeNeedsHumanReviewCount: readJsonSafe<{ summary?: { needsHumanReviewCount?: number } }>(path.join(runDir, 'scope-analysis.json'))?.summary?.needsHumanReviewCount,
    failureAppBugCount: readJsonSafe<{ summary?: { appBugCount?: number } }>(path.join(runDir, 'failure-classification.json'))?.summary?.appBugCount,
    failureTestBugCount: readJsonSafe<{ summary?: { testBugCount?: number } }>(path.join(runDir, 'failure-classification.json'))?.summary?.testBugCount,
    failureEnvironmentIssueCount: readJsonSafe<{ summary?: { environmentIssueCount?: number } }>(path.join(runDir, 'failure-classification.json'))?.summary?.environmentIssueCount,
    failurePolicyBlockCount: readJsonSafe<{ summary?: { policyBlockCount?: number } }>(path.join(runDir, 'failure-classification.json'))?.summary?.policyBlockCount,
    failureExpectedDiagnosticCount: readJsonSafe<{ summary?: { expectedDiagnosticCount?: number } }>(path.join(runDir, 'failure-classification.json'))?.summary?.expectedDiagnosticCount,
  };
}

export interface ListRunsOptions {
  limit?: number;
  status?: string;
}

export function listRunSummaries(options: ListRunsOptions = {}, artifactsRoot?: string): RunSummary[] {
  const root = artifactsRoot ?? DEFAULT_ARTIFACTS_ROOT;
  if (!fs.existsSync(root)) return [];

  const entries = fs.readdirSync(root)
    .map((runId) => readRunSummary(runId, root))
    .filter((summary): summary is RunSummary => summary !== undefined);

  // Sort by createdAt descending (newest first)
  entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  let filtered = entries;
  if (options.status) {
    filtered = filtered.filter((r) => r.status === options.status);
  }

  if (options.limit && options.limit > 0) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

export interface RunHistoryStats {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  totalScreenshots: number;
  totalBlockedSteps: number;
  totalCautionSteps: number;
  totalAllowedSteps: number;
}

export function computeRunHistoryStats(artifactsRoot?: string): RunHistoryStats {
  const runs = listRunSummaries({}, artifactsRoot);
  return {
    totalRuns: runs.length,
    completedRuns: runs.filter((r) => r.status === 'completed').length,
    failedRuns: runs.filter((r) => r.status === 'failed').length,
    totalScreenshots: runs.reduce((sum, r) => sum + r.screenshotCount, 0),
    totalBlockedSteps: runs.reduce((sum, r) => sum + r.blockedCount, 0),
    totalCautionSteps: runs.reduce((sum, r) => sum + r.cautionCount, 0),
    totalAllowedSteps: runs.reduce((sum, r) => sum + r.allowedCount, 0),
  };
}
