import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';

export interface RerunOptions {
  templateId: string;
  mode: 'demo' | 'external';
  viewport: string;
  baseUrl?: string;
  strictPolicy: boolean;
  allowSubmit: boolean;
  allowUpload: boolean;
  approveRisk?: string;
}

export interface RerunContext {
  originalRunId: string;
  newRunId: string;
  newE2ERunId: string;
  options: RerunOptions;
  eligible: boolean;
  warnings: string[];
}

export function readRunOptions(runId: string, artifactsRoot?: string): RerunOptions | undefined {
  const root = artifactsRoot ?? path.join(process.cwd(), 'artifacts', 'runs');
  const runJsonPath = path.join(root, runId, 'run.json');
  if (!fs.existsSync(runJsonPath)) return undefined;

  try {
    const manifest = JSON.parse(fs.readFileSync(runJsonPath, 'utf-8'));
    const policy = manifest.executionPolicy ?? {};
    return {
      templateId: manifest.templateId,
      mode: policy.mode ?? 'demo',
      viewport: manifest.viewport?.profile ?? 'desktop',
      baseUrl: policy.baseUrl,
      strictPolicy: policy.strictPolicy ?? false,
      allowSubmit: policy.allowSubmit ?? false,
      allowUpload: policy.allowUpload ?? false,
      approveRisk: policy.approvedRiskReason,
    };
  } catch {
    return undefined;
  }
}

export function validateRerunEligibility(runId: string, artifactsRoot?: string): { eligible: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const root = artifactsRoot ?? path.join(process.cwd(), 'artifacts', 'runs');
  const runJsonPath = path.join(root, runId, 'run.json');
  if (!fs.existsSync(runJsonPath)) {
    return { eligible: false, warnings: [`run.json not found for ${runId}`] };
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(runJsonPath, 'utf-8'));
    const policy = manifest.executionPolicy ?? {};

    if (policy.mode === 'external' && !manifest.dryRun) {
      warnings.push('External browser runs require explicit approval for rerun.');
    }

    if (!manifest.templateId) {
      warnings.push('Original run missing templateId.');
      return { eligible: false, warnings };
    }

    if (manifest.status === 'failed' && manifest.verdict === 'not_ready') {
      warnings.push('Original run failed with not_ready verdict.');
    }

    return { eligible: true, warnings };
  } catch {
    return { eligible: false, warnings: ['Could not parse run.json'] };
  }
}

export function generateNewRunContextFromRun(runId: string, artifactsRoot?: string): RerunContext {
  const options = readRunOptions(runId, artifactsRoot);
  const { eligible, warnings } = validateRerunEligibility(runId, artifactsRoot);
  const newRunId = nanoid();
  const newE2ERunId = nanoid();

  return {
    originalRunId: runId,
    newRunId,
    newE2ERunId,
    options: options ?? {
      templateId: 'unknown',
      mode: 'demo',
      viewport: 'desktop',
      strictPolicy: false,
      allowSubmit: false,
      allowUpload: false,
    },
    eligible,
    warnings,
  };
}
