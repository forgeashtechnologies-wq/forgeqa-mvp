import fs from 'node:fs';
import path from 'node:path';
import type { WorkflowPlan, GoldenDataSet, RunManifest } from '../schemas/core.js';

const ARTIFACTS_ROOT = path.resolve(process.cwd(), 'artifacts', 'runs');

function sanitizeRunId(runId: string): string {
  // Allow alphanumeric, hyphens, underscores only
  const cleaned = runId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (cleaned.length === 0 || cleaned !== runId) {
    throw new Error(`Invalid runId: ${runId}`);
  }
  return cleaned;
}

export function getRunDir(runId: string): string {
  const safeId = sanitizeRunId(runId);
  const target = path.join(ARTIFACTS_ROOT, safeId);

  // Prevent path traversal: ensure the resolved path is still under ARTIFACTS_ROOT
  const resolved = path.resolve(target);
  const rootResolved = path.resolve(ARTIFACTS_ROOT);
  if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
    throw new Error(`Path traversal blocked for runId: ${runId}`);
  }

  return target;
}

export function createRunArtifactsDir(runId: string): string {
  const dir = getRunDir(runId);
  fs.mkdirSync(dir, { recursive: true });

  const screenshotsDir = path.join(dir, 'screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const filesDir = path.join(dir, 'files');
  fs.mkdirSync(filesDir, { recursive: true });

  return dir;
}

export function writePlan(plan: WorkflowPlan, runId: string): string {
  const dir = getRunDir(runId);
  const filePath = path.join(dir, 'plan.json');
  fs.writeFileSync(filePath, JSON.stringify(plan, null, 2), 'utf-8');
  return filePath;
}

export function writeData(data: GoldenDataSet, runId: string): string {
  const dir = getRunDir(runId);
  const filePath = path.join(dir, 'data.json');

  // Strip binary content for JSON serialization; keep metadata
  const serializable = {
    ...data,
    files: data.files.map((f: { filename: string; mimeType: string; sizeBytes: number; content?: unknown }) => ({
      ...f,
      content: undefined,
    })),
  };

  fs.writeFileSync(filePath, JSON.stringify(serializable, null, 2), 'utf-8');
  return filePath;
}

export function writeRunManifest(manifest: RunManifest, runId: string): string {
  const dir = getRunDir(runId);
  const filePath = path.join(dir, 'run.json');
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2), 'utf-8');
  return filePath;
}

export function finalizeRunManifest(manifest: RunManifest, runId: string): RunManifest {
  const finalized: RunManifest = {
    ...manifest,
    isFinalized: true,
    completedAt: new Date().toISOString(),
  };
  writeRunManifest(finalized, runId);
  return finalized;
}

export function writeReportMarkdown(content: string, runId: string): string {
  const dir = getRunDir(runId);
  const filePath = path.join(dir, 'report.md');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function writeReportHtml(content: string, runId: string): string {
  const dir = getRunDir(runId);
  const filePath = path.join(dir, 'report.html');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function writeCleanupReport(content: string, runId: string): string {
  const dir = getRunDir(runId);
  const filePath = path.join(dir, 'cleanup-report.md');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function writeArtifactValidation(content: string, runId: string): string {
  const dir = getRunDir(runId);
  const filePath = path.join(dir, 'artifact-validation.json');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function writeArtifactManifest(content: string, runId: string): string {
  const dir = getRunDir(runId);
  const filePath = path.join(dir, 'artifact-manifest.json');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function writeDataSafetyAudit(content: string, runId: string): string {
  const dir = getRunDir(runId);
  const filePath = path.join(dir, 'data-safety-audit.json');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function writeDataSafetyAuditMarkdown(content: string, runId: string): string {
  const dir = getRunDir(runId);
  const filePath = path.join(dir, 'data-safety-audit.md');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function writeScopeAnalysis(content: string, runId: string): string {
  const dir = getRunDir(runId);
  const filePath = path.join(dir, 'scope-analysis.json');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function writeScopeAnalysisMarkdown(content: string, runId: string): string {
  const dir = getRunDir(runId);
  const filePath = path.join(dir, 'scope-analysis.md');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function writeFailureClassification(content: string, runId: string): string {
  const dir = getRunDir(runId);
  const filePath = path.join(dir, 'failure-classification.json');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function writeFailureClassificationMarkdown(content: string, runId: string): string {
  const dir = getRunDir(runId);
  const filePath = path.join(dir, 'failure-classification.md');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function writeScreenshotGalleryHtml(content: string, runId: string): string {
  const dir = getRunDir(runId);
  const filePath = path.join(dir, 'screenshot-gallery.html');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function writeScreenshotGalleryMarkdown(content: string, runId: string): string {
  const dir = getRunDir(runId);
  const filePath = path.join(dir, 'screenshot-gallery.md');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function writeScreenshotGalleryJson(content: string, runId: string): string {
  const dir = getRunDir(runId);
  const filePath = path.join(dir, 'screenshot-gallery.json');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function writePreflightScanJson(content: string, runId: string): string {
  const dir = getRunDir(runId);
  const scanDir = path.join(dir, 'preflight-scan');
  fs.mkdirSync(scanDir, { recursive: true });
  const filePath = path.join(scanDir, 'scan-result.json');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function writePreflightScanMarkdown(content: string, runId: string): string {
  const dir = getRunDir(runId);
  const scanDir = path.join(dir, 'preflight-scan');
  fs.mkdirSync(scanDir, { recursive: true });
  const filePath = path.join(scanDir, 'scan-report.md');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function writePreflightScanHtml(content: string, runId: string): string {
  const dir = getRunDir(runId);
  const scanDir = path.join(dir, 'preflight-scan');
  fs.mkdirSync(scanDir, { recursive: true });
  const filePath = path.join(scanDir, 'scan-report.html');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function writeIndustryAssessmentJson(content: string, runId: string): string {
  const dir = getRunDir(runId);
  const filePath = path.join(dir, 'industry-assessment.json');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function writeIndustryAssessmentMarkdown(content: string, runId: string): string {
  const dir = getRunDir(runId);
  const filePath = path.join(dir, 'industry-assessment.md');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function listArtifacts(runId: string): string[] {
  const dir = getRunDir(runId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true }).map((p) => String(p));
}

export function listRunDirs(): string[] {
  if (!fs.existsSync(ARTIFACTS_ROOT)) return [];
  return fs.readdirSync(ARTIFACTS_ROOT)
    .filter((id) => {
      const runDir = path.join(ARTIFACTS_ROOT, id);
      return fs.statSync(runDir).isDirectory() && fs.existsSync(path.join(runDir, 'run.json'));
    })
    .sort()
    .reverse();
}
