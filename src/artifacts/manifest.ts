import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { RunManifest } from '../schemas/core.js';
import type { ArtifactValidationResult } from './validator.js';

export interface ArtifactManifest {
  runId: string;
  generatorVersion: string;
  generatedAt: string;
  artifactCount: number;
  createdAt: string;
  artifacts: ArtifactEntry[];
  reportHealth: {
    status: 'pass' | 'warn' | 'fail';
    checks: number;
    failures: number;
    warnings: number;
  };
  screenshotCount: number;
  traceZipPresent: boolean;
  cleanupDryRun: boolean;
  viewport?: {
    profile?: string;
    width?: number;
    height?: number;
    isMobile?: boolean;
    hasTouch?: boolean;
    deviceScaleFactor?: number;
  };
  dataSafetyAudit?: {
    status: 'pass' | 'warn' | 'fail';
    userCount: number;
    fileCount: number;
    formCount: number;
    tableRecordCount: number;
    generatedFileChecksums: Record<string, string>;
  };
  executionPolicySummary?: {
    mode: string;
    strictPolicy: boolean;
    blockedCount: number;
    cautionCount: number;
    allowedCount: number;
  };
}

export interface ArtifactEntry {
  name: string;
  relativePath: string;
  sizeBytes: number;
  sha256?: string;
  category: 'core' | 'evidence' | 'report' | 'audit' | 'validation' | 'data' | 'fixture' | 'policy';
  required: boolean;
  present: boolean;
}

const GENERATOR_VERSION = 'forgeqa-mvp-0.1.0';

function getArtifactCategory(name: string): ArtifactEntry['category'] {
  if (name === 'plan.json' || name === 'run.json') return 'core';
  if (name === 'data.json') return 'data';
  if (name === 'report.md' || name === 'report.html' || name === 'cleanup-report.md') return 'report';
  if (name.endsWith('.png')) return 'evidence';
  if (name === 'trace.zip') return 'evidence';
  if (name.startsWith('data-safety')) return 'audit';
  if (name.startsWith('artifact-validation')) return 'validation';
  if (name.startsWith('artifact-manifest')) return 'core';
  if (name.startsWith('fixture-validation')) return 'fixture';
  if (name.startsWith('execution-policy')) return 'policy';
  if (name.startsWith('scope-analysis')) return 'report';
  if (name.startsWith('failure-classification')) return 'report';
  if (name.startsWith('screenshot-gallery')) return 'evidence';
  return 'core';
}

const REQUIRED_ARTIFACTS = [
  'plan.json', 'data.json', 'run.json', 'report.md', 'report.html',
  'cleanup-report.md', 'data-safety-audit.json', 'data-safety-audit.md',
  'fixture-validation.json', 'fixture-validation.md',
  'scope-analysis.json', 'scope-analysis.md',
  'failure-classification.json', 'failure-classification.md',
  'screenshot-gallery.html', 'screenshot-gallery.md', 'screenshot-gallery.json',
];

function sha256File(filePath: string): string | undefined {
  try {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
  } catch {
    return undefined;
  }
}

export function generateArtifactManifest(
  runDir: string,
  manifest: RunManifest,
  validation: ArtifactValidationResult,
): ArtifactManifest {
  const entries: ArtifactEntry[] = [];
  const files = [
    'plan.json',
    'data.json',
    'run.json',
    'report.md',
    'report.html',
    'cleanup-report.md',
    'artifact-validation.json',
    'artifact-manifest.json',
    'trace.zip',
    'data-safety-audit.json',
    'data-safety-audit.md',
    'fixture-validation.json',
    'fixture-validation.md',
    'execution-policy-preview.json',
    'execution-policy-preview.md',
    'scope-analysis.json',
    'scope-analysis.md',
    'failure-classification.json',
    'failure-classification.md',
    'screenshot-gallery.html',
    'screenshot-gallery.md',
    'screenshot-gallery.json',
  ];

  for (const file of files) {
    const filePath = path.join(runDir, file);
    const exists = fs.existsSync(filePath);
    const stats = exists ? fs.statSync(filePath) : undefined;
    entries.push({
      name: file,
      relativePath: file,
      sizeBytes: stats?.size ?? 0,
      sha256: exists ? sha256File(filePath) : undefined,
      category: getArtifactCategory(file),
      required: REQUIRED_ARTIFACTS.includes(file),
      present: exists,
    });
  }

  // Screenshots
  const screenshotsDir = path.join(runDir, 'screenshots');
  if (fs.existsSync(screenshotsDir) && fs.statSync(screenshotsDir).isDirectory()) {
    for (const ss of fs.readdirSync(screenshotsDir)) {
      if (ss.endsWith('.png')) {
        const ssPath = path.join(screenshotsDir, ss);
        const stats = fs.statSync(ssPath);
        entries.push({
          name: ss,
          relativePath: path.join('screenshots', ss),
          sizeBytes: stats.size,
          sha256: sha256File(ssPath),
          category: 'evidence',
          required: false,
          present: true,
        });
      }
    }
  }

  // Generated files
  const filesDir = path.join(runDir, 'files');
  if (fs.existsSync(filesDir) && fs.statSync(filesDir).isDirectory()) {
    for (const f of fs.readdirSync(filesDir)) {
      const fPath = path.join(filesDir, f);
      const stats = fs.statSync(fPath);
      entries.push({
        name: f,
        relativePath: path.join('files', f),
        sizeBytes: stats.size,
        sha256: sha256File(fPath),
        category: 'data',
        required: false,
        present: true,
      });
    }
  }

  const screenshotCount = entries.filter((e) => e.relativePath.startsWith('screenshots/')).length;
  const traceZipPresent = entries.some((e) => e.name === 'trace.zip');
  const cleanupDryRun = fs.existsSync(path.join(runDir, 'cleanup-report.md'))
    ? fs.readFileSync(path.join(runDir, 'cleanup-report.md'), 'utf-8').includes('No items were deleted. This was a dry-run cleanup report only.')
    : false;

  const failCount = validation.checks.filter((c) => c.status === 'fail').length;
  const warnCount = validation.checks.filter((c) => c.status === 'warn').length;
  const healthStatus = failCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : 'pass';

  // Data safety audit summary
  let dataSafetyAudit: ArtifactManifest['dataSafetyAudit'] | undefined;
  let executionPolicySummary: ArtifactManifest['executionPolicySummary'] | undefined;

  const runJsonPath = path.join(runDir, 'run.json');
  if (fs.existsSync(runJsonPath)) {
    try {
      const runManifest = JSON.parse(fs.readFileSync(runJsonPath, 'utf-8'));
      if (runManifest.executionPolicy) {
        executionPolicySummary = {
          mode: runManifest.executionPolicy.mode,
          strictPolicy: runManifest.executionPolicy.strictPolicy,
          blockedCount: runManifest.executionPolicy.blockedCount,
          cautionCount: runManifest.executionPolicy.cautionCount,
          allowedCount: runManifest.executionPolicy.allowedCount,
        };
      }
    } catch {
      // ignore
    }
  }

  const auditPath = path.join(runDir, 'data-safety-audit.json');
  if (fs.existsSync(auditPath)) {
    try {
      const audit = JSON.parse(fs.readFileSync(auditPath, 'utf-8'));
      const dataPath = path.join(runDir, 'data.json');
      let generatedFileChecksums: Record<string, string> = {};
      if (fs.existsSync(dataPath)) {
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        for (const file of data.files ?? []) {
          if (file.sha256 && file.filename) {
            generatedFileChecksums[file.filename] = file.sha256;
          }
        }
      }
      dataSafetyAudit = {
        status: audit.status,
        userCount: audit.summary?.userCount ?? 0,
        fileCount: audit.summary?.fileCount ?? 0,
        formCount: audit.summary?.formCount ?? 0,
        tableRecordCount: audit.summary?.tableRecordCount ?? 0,
        generatedFileChecksums,
      };
    } catch {
      // ignore parse errors
    }
  }

  return {
    runId: manifest.runId,
    generatorVersion: GENERATOR_VERSION,
    generatedAt: new Date().toISOString(),
    artifactCount: entries.length,
    createdAt: manifest.completedAt ?? manifest.startedAt,
    artifacts: entries,
    reportHealth: {
      status: healthStatus,
      checks: validation.checks.length,
      failures: failCount,
      warnings: warnCount,
    },
    screenshotCount,
    traceZipPresent,
    cleanupDryRun,
    viewport: manifest.viewport ?? undefined,
    dataSafetyAudit,
    executionPolicySummary,
  };
}
