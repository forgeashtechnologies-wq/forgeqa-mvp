import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  createRunArtifactsDir,
  writePlan,
  writeData,
  writeRunManifest,
  finalizeRunManifest,
  listArtifacts,
} from './manager.js';
import type { WorkflowPlan, GoldenDataSet, RunManifest } from '../schemas/core.js';

const TEST_RUN_ID = 'test_run_abc123';
const ARTIFACTS_ROOT = path.resolve(process.cwd(), 'artifacts', 'runs');

function cleanup(runId: string) {
  const dir = path.join(ARTIFACTS_ROOT, runId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('Artifact Manager', () => {
  beforeEach(() => cleanup(TEST_RUN_ID));
  afterEach(() => cleanup(TEST_RUN_ID));

  const mockPlan: WorkflowPlan = {
    runId: TEST_RUN_ID,
    templateId: 't1',
    templateName: 'Test',
    description: 'Test plan',
    steps: [],
    createdAt: new Date().toISOString(),
  };

  const mockData: GoldenDataSet = {
    runId: TEST_RUN_ID,
    e2eRunId: 'e2e_456',
    createdByForgeQA: true,
    safeToDelete: true,
    generatedAt: new Date().toISOString(),
    users: [],
    files: [],
  };

  const mockManifest: RunManifest = {
    runId: TEST_RUN_ID,
    e2eRunId: 'e2e_456',
    templateId: 't1',
    status: 'planned',
    startedAt: new Date().toISOString(),
    steps: [],
    artifactsDir: `artifacts/runs/${TEST_RUN_ID}`,
    isFinalized: false,
  };

  it('creates run artifacts directory with screenshots subdir', () => {
    const dir = createRunArtifactsDir(TEST_RUN_ID);
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.existsSync(path.join(dir, 'screenshots'))).toBe(true);
  });

  it('writes plan.json', () => {
    createRunArtifactsDir(TEST_RUN_ID);
    const filePath = writePlan(mockPlan, TEST_RUN_ID);
    expect(fs.existsSync(filePath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(content.runId).toBe(TEST_RUN_ID);
  });

  it('writes data.json without binary content', () => {
    createRunArtifactsDir(TEST_RUN_ID);
    const dataWithFile: GoldenDataSet = {
      ...mockData,
      files: [
        {
          runId: TEST_RUN_ID,
          e2eRunId: 'e2e_456',
          createdByForgeQA: true,
          safeToDelete: true,
          filename: 'test.png',
          mimeType: 'image/png',
          sizeBytes: 1024,
          content: Buffer.alloc(1024, 0),
        },
      ],
    };
    const filePath = writeData(dataWithFile, TEST_RUN_ID);
    expect(fs.existsSync(filePath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(content.files[0].content).toBeUndefined();
    expect(content.files[0].filename).toBe('test.png');
  });

  it('writes and finalizes run manifest', () => {
    createRunArtifactsDir(TEST_RUN_ID);
    writeRunManifest(mockManifest, TEST_RUN_ID);
    const finalized = finalizeRunManifest(mockManifest, TEST_RUN_ID);
    expect(finalized.isFinalized).toBe(true);
    expect(finalized.completedAt).toBeDefined();
  });

  it('lists artifacts', () => {
    createRunArtifactsDir(TEST_RUN_ID);
    writePlan(mockPlan, TEST_RUN_ID);
    const artifacts = listArtifacts(TEST_RUN_ID);
    expect(artifacts.length).toBeGreaterThan(0);
    expect(artifacts.some((a) => a.includes('plan.json'))).toBe(true);
  });

  it('blocks path traversal in runId', () => {
    expect(() => createRunArtifactsDir('../etc/passwd')).toThrow('Invalid runId');
  });

  it('rejects invalid characters in runId', () => {
    expect(() => createRunArtifactsDir('run with spaces')).toThrow('Invalid runId');
    expect(() => createRunArtifactsDir('run;cmd')).toThrow('Invalid runId');
  });
});
