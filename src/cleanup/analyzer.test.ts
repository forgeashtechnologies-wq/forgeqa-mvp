import { describe, it, expect } from 'vitest';
import { analyzeCleanup, generateCleanupMarkdown } from './analyzer.js';
import type { GoldenDataSet, GoldenUser, GoldenFile } from '../schemas/core.js';

function createSafeUser(): GoldenUser {
  return {
    runId: 'run_abc',
    e2eRunId: 'e2e_def',
    createdByForgeQA: true,
    safeToDelete: true,
    email: 'fq_user@forgeqa.test',
    username: 'fq_user_1',
    displayName: 'Test User',
    password: 'Fq_SecurePass123!',
    role: 'alumni',
  };
}

function createUnsafeUser(): GoldenUser {
  // Cast to test analyzer defensive behavior against schema-violating data
  return {
    runId: 'run_abc',
    e2eRunId: 'e2e_def',
    createdByForgeQA: true,
    safeToDelete: false,
    email: 'fq_user@forgeqa.test',
    username: 'fq_user_2',
    displayName: 'Unsafe User',
    password: 'Fq_SecurePass123!',
    role: 'alumni',
  } as unknown as GoldenUser;
}

function createSafeFile(): GoldenFile {
  return {
    runId: 'run_abc',
    e2eRunId: 'e2e_def',
    createdByForgeQA: true,
    safeToDelete: true,
    filename: 'fq_avatar_test.png',
    mimeType: 'image/png',
    sizeBytes: 1024,
    content: Buffer.alloc(1024, 0),
  };
}

describe('analyzeCleanup', () => {
  it('marks safe items as wouldDelete', () => {
    const data: GoldenDataSet = {
      runId: 'run_abc',
      e2eRunId: 'e2e_def',
      createdByForgeQA: true,
      safeToDelete: true,
      generatedAt: new Date().toISOString(),
      users: [createSafeUser()],
      files: [createSafeFile()],
    };

    const report = analyzeCleanup(data);
    expect(report.dryRun).toBe(true);
    expect(report.summary.total).toBe(2);
    expect(report.summary.safe).toBe(2);
    expect(report.summary.wouldDelete).toBe(2);
    expect(report.items.every((i) => i.wouldDelete)).toBe(true);
  });

  it('skips unsafe items', () => {
    const data: GoldenDataSet = {
      runId: 'run_abc',
      e2eRunId: 'e2e_def',
      createdByForgeQA: true,
      safeToDelete: true,
      generatedAt: new Date().toISOString(),
      users: [createSafeUser(), createUnsafeUser()],
      files: [],
    };

    const report = analyzeCleanup(data);
    expect(report.summary.total).toBe(2);
    expect(report.summary.safe).toBe(1);
    expect(report.summary.unsafe).toBe(1);
    expect(report.summary.wouldDelete).toBe(1);
    expect(report.items[0].wouldDelete).toBe(true);
    expect(report.items[1].wouldDelete).toBe(false);
  });

  it('includes run IDs', () => {
    const data: GoldenDataSet = {
      runId: 'run_abc',
      e2eRunId: 'e2e_def',
      createdByForgeQA: true,
      safeToDelete: true,
      generatedAt: new Date().toISOString(),
      users: [],
      files: [],
    };

    const report = analyzeCleanup(data);
    expect(report.runId).toBe('run_abc');
    expect(report.e2eRunId).toBe('e2e_def');
  });
});

describe('generateCleanupMarkdown', () => {
  it('contains mandatory dry-run wording', () => {
    const data: GoldenDataSet = {
      runId: 'run_abc',
      e2eRunId: 'e2e_def',
      createdByForgeQA: true,
      safeToDelete: true,
      generatedAt: new Date().toISOString(),
      users: [createSafeUser()],
      files: [],
    };

    const report = analyzeCleanup(data);
    const md = generateCleanupMarkdown(report);
    expect(md).toContain('No items were deleted. This was a dry-run cleanup report only.');
  });

  it('lists items that would be cleaned', () => {
    const data: GoldenDataSet = {
      runId: 'run_abc',
      e2eRunId: 'e2e_def',
      createdByForgeQA: true,
      safeToDelete: true,
      generatedAt: new Date().toISOString(),
      users: [createSafeUser()],
      files: [createSafeFile()],
    };

    const report = analyzeCleanup(data);
    const md = generateCleanupMarkdown(report);
    expect(md).toContain('Items That Would Be Cleaned');
    expect(md).toContain('fq_user@forgeqa.test');
    expect(md).toContain('fq_avatar_test.png');
  });

  it('lists skipped items', () => {
    const data: GoldenDataSet = {
      runId: 'run_abc',
      e2eRunId: 'e2e_def',
      createdByForgeQA: true,
      safeToDelete: true,
      generatedAt: new Date().toISOString(),
      users: [createSafeUser(), createUnsafeUser()],
      files: [],
    };

    const report = analyzeCleanup(data);
    const md = generateCleanupMarkdown(report);
    expect(md).toContain('Items Skipped');
    expect(md).toContain('Unsafe User');
  });

  it('contains safety checks section', () => {
    const data: GoldenDataSet = {
      runId: 'run_abc',
      e2eRunId: 'e2e_def',
      createdByForgeQA: true,
      safeToDelete: true,
      generatedAt: new Date().toISOString(),
      users: [createSafeUser()],
      files: [],
    };

    const report = analyzeCleanup(data);
    const md = generateCleanupMarkdown(report);
    expect(md).toContain('Safety Checks');
    expect(md).toContain('createdByForgeQA=true');
    expect(md).toContain('safeToDelete=true');
  });
});
