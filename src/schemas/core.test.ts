import { describe, it, expect } from 'vitest';
import {
  WorkflowPlan,
  GoldenDataSet,
  RunManifest,
  CleanupReport,
} from './core.js';

describe('WorkflowPlan schema', () => {
  it('accepts a valid plan', () => {
    const plan = {
      runId: 'run_abc123',
      templateId: 't1',
      templateName: 'Test',
      description: 'A test plan',
      steps: [
        {
          id: 's1',
          order: 0,
          description: 'Navigate',
          action: 'navigate' as const,
          target: '/',
          screenshot: true,
        },
      ],
      createdAt: new Date().toISOString(),
    };
    expect(() => WorkflowPlan.parse(plan)).not.toThrow();
  });

  it('rejects a plan without steps', () => {
    const plan = {
      runId: 'run_abc123',
      templateId: 't1',
      templateName: 'Test',
      description: 'A test plan',
      steps: [],
      createdAt: new Date().toISOString(),
    };
    expect(() => WorkflowPlan.parse(plan)).toThrow();
  });
});

describe('GoldenDataSet schema', () => {
  it('accepts valid golden data with safety tags', () => {
    const data = {
      runId: 'run_abc',
      e2eRunId: 'e2e_def',
      createdByForgeQA: true as const,
      safeToDelete: true as const,
      generatedAt: new Date().toISOString(),
      users: [
        {
          runId: 'run_abc',
          e2eRunId: 'e2e_def',
          createdByForgeQA: true as const,
          safeToDelete: true as const,
          email: 'user@forgeqa.test',
          username: 'fq_user_1',
          displayName: 'Test User',
          password: 'SecurePass123!',
          role: 'alumni',
        },
      ],
      files: [],
    };
    expect(() => GoldenDataSet.parse(data)).not.toThrow();
  });

  it('rejects data with wrong email domain', () => {
    const data = {
      runId: 'run_abc',
      e2eRunId: 'e2e_def',
      createdByForgeQA: true as const,
      safeToDelete: true as const,
      generatedAt: new Date().toISOString(),
      users: [
        {
          runId: 'run_abc',
          e2eRunId: 'e2e_def',
          createdByForgeQA: true as const,
          safeToDelete: true as const,
          email: 'user@gmail.com',
          username: 'fq_user_1',
          displayName: 'Test User',
          password: 'SecurePass123!',
          role: 'alumni',
        },
      ],
      files: [],
    };
    expect(() => GoldenDataSet.parse(data)).toThrow();
  });

  it('rejects data without fq_ prefix on username', () => {
    const data = {
      runId: 'run_abc',
      e2eRunId: 'e2e_def',
      createdByForgeQA: true as const,
      safeToDelete: true as const,
      generatedAt: new Date().toISOString(),
      users: [
        {
          runId: 'run_abc',
          e2eRunId: 'e2e_def',
          createdByForgeQA: true as const,
          safeToDelete: true as const,
          email: 'user@forgeqa.test',
          username: 'alumni_user',
          displayName: 'Test User',
          password: 'SecurePass123!',
          role: 'alumni',
        },
      ],
      files: [],
    };
    expect(() => GoldenDataSet.parse(data)).toThrow();
  });
});

describe('RunManifest schema', () => {
  it('accepts a valid manifest', () => {
    const manifest = {
      runId: 'run_abc',
      e2eRunId: 'e2e_def',
      templateId: 't1',
      status: 'planned' as const,
      startedAt: new Date().toISOString(),
      steps: [],
      artifactsDir: 'artifacts/runs/run_abc',
      isFinalized: false,
    };
    expect(() => RunManifest.parse(manifest)).not.toThrow();
  });
});

describe('CleanupReport schema', () => {
  it('accepts a valid dry-run report', () => {
    const report = {
      runId: 'run_abc',
      e2eRunId: 'e2e_def',
      generatedAt: new Date().toISOString(),
      dryRun: true as const,
      items: [
        {
          id: 'item1',
          type: 'user',
          identifier: 'fq_user@forgeqa.test',
          safeToDelete: true,
          wouldDelete: true,
          reason: 'Tagged safeToDelete by ForgeQA',
        },
      ],
      summary: {
        total: 1,
        safe: 1,
        unsafe: 0,
        wouldDelete: 1,
      },
    };
    expect(() => CleanupReport.parse(report)).not.toThrow();
  });
});
