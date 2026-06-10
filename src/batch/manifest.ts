import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { BatchManifest, BatchManifestArtifact } from './validator-types.js';
import type { BatchResult } from './types.js';

function hashFile(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function fileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function classifyArtifact(filename: string): BatchManifestArtifact['category'] {
  if (filename.includes('plan')) return 'plan';
  if (filename.includes('result')) return 'result';
  if (filename.includes('industry')) return 'industry';
  if (filename.includes('validation')) return 'validation';
  if (filename.includes('compare')) return 'comparison';
  if (filename.endsWith('.md') || filename.endsWith('.html')) return 'report';
  return 'report';
}

const REQUIRED_FILES = ['batch-plan.json', 'batch-plan.md'];

export function generateBatchManifest(batchResult: BatchResult): BatchManifest {
  const batchDir = path.join(process.cwd(), 'artifacts', 'batches', batchResult.batchId);
  const artifacts: BatchManifestArtifact[] = [];

  if (fs.existsSync(batchDir)) {
    const files = fs.readdirSync(batchDir);
    for (const f of files) {
      const filePath = path.join(batchDir, f);
      if (fs.statSync(filePath).isFile()) {
        artifacts.push({
          relativePath: f,
          sizeBytes: fileSize(filePath),
          sha256: hashFile(filePath),
          category: classifyArtifact(f),
          required: REQUIRED_FILES.includes(f),
          present: true,
        });
      }
    }
  }

  // Ensure required files are listed even if missing
  for (const req of REQUIRED_FILES) {
    if (!artifacts.some((a) => a.relativePath === req)) {
      artifacts.push({
        relativePath: req,
        sizeBytes: 0,
        sha256: '',
        category: classifyArtifact(req),
        required: true,
        present: false,
      });
    }
  }

  return {
    batchId: batchResult.batchId,
    createdAt: batchResult.startedAt,
    updatedAt: new Date().toISOString(),
    artifactCount: artifacts.length,
    artifacts,
    batchStatus: batchResult.status,
    validationStatus: 'unknown',
    runIds: batchResult.runIds,
    industryPackId: batchResult.industryPackId,
    caveats: batchResult.industryAssessment?.caveats ?? [],
    disclaimer: batchResult.industryAssessment?.disclaimer ?? 'This is a ForgeQA batch artifact set. Not a compliance or security certification.',
  };
}

export function generateBatchManifestJson(manifest: BatchManifest): string {
  return JSON.stringify(manifest, null, 2);
}
