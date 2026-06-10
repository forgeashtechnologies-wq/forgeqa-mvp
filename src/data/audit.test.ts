import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runDataSafetyAudit, generateDataSafetyAuditMarkdown } from './audit.js';
import type { GoldenDataSet } from '../schemas/core.js';

function createSafeData(overrides?: Partial<GoldenDataSet>): GoldenDataSet {
  return {
    runId: 'run_test',
    e2eRunId: 'e2e_test',
    createdByForgeQA: true,
    safeToDelete: true,
    generatedAt: new Date().toISOString(),
    source: 'forgeqa',
    profileType: 'guest',
    templateId: 'test.template',
    users: [{
      runId: 'run_test',
      e2eRunId: 'e2e_test',
      createdByForgeQA: true,
      safeToDelete: true,
      email: 'fq_user@forgeqa.test',
      username: 'fq_testuser',
      displayName: 'Test User',
      password: 'Fq_test_password_123',
      role: 'guest',
      profileType: 'guest',
    }],
    files: [{
      runId: 'run_test',
      e2eRunId: 'e2e_test',
      createdByForgeQA: true,
      safeToDelete: true,
      filename: 'fq_test.png',
      mimeType: 'image/png',
      sizeBytes: 1024,
      content: Buffer.alloc(1024, 0),
      sha256: 'a'.repeat(64),
      relativePath: 'files/fq_test.png',
    }],
    forms: [],
    tableRecords: [],
    ...overrides,
  };
}

describe('runDataSafetyAudit', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeqa-audit-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('passes safe generated data', () => {
    const data = createSafeData();
    fs.mkdirSync(path.join(tempDir, 'files'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'files', 'fq_test.png'), Buffer.alloc(1024, 0));
    const audit = runDataSafetyAudit(data, tempDir);
    expect(audit.status).toBe('pass');
    expect(audit.summary.userCount).toBe(1);
    expect(audit.summary.fileCount).toBe(1);
  });

  it('fails missing safeToDelete', () => {
    const data = createSafeData({
      users: [{
        runId: 'run_test',
        e2eRunId: 'e2e_test',
        createdByForgeQA: true,
        safeToDelete: false as true, // type hack for test
        email: 'fq_user@forgeqa.test',
        username: 'fq_testuser',
        displayName: 'Test User',
        password: 'Fq_test_password_123',
        role: 'guest',
      }],
    });
    const audit = runDataSafetyAudit(data, tempDir);
    expect(audit.status).toBe('fail');
    const safeCheck = audit.checks.find((c) => c.name === 'safeToDelete');
    expect(safeCheck?.status).toBe('fail');
  });

  it('fails real email domain', () => {
    const data = createSafeData({
      users: [{
        runId: 'run_test',
        e2eRunId: 'e2e_test',
        createdByForgeQA: true,
        safeToDelete: true,
        email: 'user@gmail.com',
        username: 'fq_testuser',
        displayName: 'Test User',
        password: 'Fq_test_password_123',
        role: 'guest',
      }],
    });
    const audit = runDataSafetyAudit(data, tempDir);
    expect(audit.status).toBe('fail');
    const domainCheck = audit.checks.find((c) => c.name === 'approved email domains');
    expect(domainCheck?.status).toBe('fail');
  });

  it('fails file outside run folder', () => {
    const data = createSafeData({
      files: [{
        runId: 'run_test',
        e2eRunId: 'e2e_test',
        createdByForgeQA: true,
        safeToDelete: true,
        filename: 'fq_test.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        content: Buffer.alloc(1024, 0),
        sha256: 'a'.repeat(64),
        relativePath: '../outside.png',
      }],
    });
    const audit = runDataSafetyAudit(data, tempDir);
    expect(audit.status).toBe('fail');
    const pathCheck = audit.checks.find((c) => c.name === 'files inside run folder');
    expect(pathCheck?.status).toBe('fail');
  });

  it('warns missing sha256', () => {
    const data = createSafeData({
      files: [{
        runId: 'run_test',
        e2eRunId: 'e2e_test',
        createdByForgeQA: true,
        safeToDelete: true,
        filename: 'fq_test.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        content: Buffer.alloc(1024, 0),
        relativePath: 'files/fq_test.png',
      }],
    });
    const audit = runDataSafetyAudit(data, tempDir);
    const shaCheck = audit.checks.find((c) => c.name === 'file sha256 present');
    expect(shaCheck?.status).toBe('warn');
  });

  it('detects secret-like keys in data', () => {
    const data = createSafeData({
      users: [{
        runId: 'run_test',
        e2eRunId: 'e2e_test',
        createdByForgeQA: true,
        safeToDelete: true,
        email: 'fq_user@forgeqa.test',
        username: 'fq_testuser',
        displayName: 'Test User',
        password: 'api_key=sk-12345',
        role: 'guest',
      }],
    });
    const audit = runDataSafetyAudit(data, tempDir);
    const secretCheck = audit.checks.find((c) => c.name === 'no leaked secrets');
    expect(secretCheck?.status).toBe('warn');
  });

  it('writes json and md audit output', () => {
    const data = createSafeData();
    const audit = runDataSafetyAudit(data, tempDir);
    const md = generateDataSafetyAuditMarkdown(audit);
    expect(md).toContain('# Data Safety Audit');
    expect(md).toContain('ForgeQA generated only synthetic test data');
    expect(md).toContain(audit.runId);
  });

  it('counts total entities correctly', () => {
    const data = createSafeData({
      forms: [{ field1: 'value1' }],
      tableRecords: [{ id: 1 }, { id: 2 }],
    });
    fs.mkdirSync(path.join(tempDir, 'files'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'files', 'fq_test.png'), Buffer.alloc(1024, 0));
    const audit = runDataSafetyAudit(data, tempDir);
    expect(audit.summary.totalEntities).toBe(5); // 1 user + 1 file + 1 form + 2 records
  });
});
