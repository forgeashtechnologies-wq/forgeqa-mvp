import { describe, it, expect } from 'vitest';
import { generateGoldenData, generateUserProfile, generateFiles, generateDiagnosticData, SAFE_DOMAINS } from './generator.js';
import { GoldenDataSet } from '../schemas/core.js';

describe('generateGoldenData', () => {
  it('generates data with required safety tags', () => {
    const data = generateGoldenData({
      runId: 'run_abc',
      e2eRunId: 'e2e_def',
    });

    expect(data.runId).toBe('run_abc');
    expect(data.e2eRunId).toBe('e2e_def');
    expect(data.createdByForgeQA).toBe(true);
    expect(data.safeToDelete).toBe(true);
    expect(data.source).toBe('forgeqa');
  });

  it('generates at least one user by default', () => {
    const data = generateGoldenData({
      runId: 'run_abc',
      e2eRunId: 'e2e_def',
    });

    expect(data.users.length).toBe(1);
    const user = data.users[0];
    expect(user.email).toMatch(/@(forgeqa\.test|forgecircle\.test|example\.test)$/);
    expect(user.username).toMatch(/^fq_/);
    expect(user.password.length).toBeGreaterThanOrEqual(12);
    expect(user.createdByForgeQA).toBe(true);
    expect(user.safeToDelete).toBe(true);
    expect(user.profileType).toBeDefined();
  });

  it('generates files when includeFiles is true', () => {
    const data = generateGoldenData({
      runId: 'run_abc',
      e2eRunId: 'e2e_def',
      userCount: 2,
      includeFiles: true,
    });

    expect(data.files.length).toBe(2);
    expect(data.files[0].filename).toMatch(/^fq_.*\.(png|pdf|txt|csv|json)$/);
    expect(data.files[0].createdByForgeQA).toBe(true);
    expect(data.files[0].safeToDelete).toBe(true);
    expect(data.files[0].sha256).toBeDefined();
    expect(data.files[0].sha256!.length).toBe(64);
    expect(data.files[0].relativePath).toMatch(/^files\//);
  });

  it('does not generate files when includeFiles is false', () => {
    const data = generateGoldenData({
      runId: 'run_abc',
      e2eRunId: 'e2e_def',
      includeFiles: false,
    });

    expect(data.files.length).toBe(0);
  });

  it('passes GoldenDataSet schema validation', () => {
    const data = generateGoldenData({
      runId: 'run_abc',
      e2eRunId: 'e2e_def',
      userCount: 3,
      includeFiles: true,
    });

    expect(() => GoldenDataSet.parse(data)).not.toThrow();
  });

  it('generates alumni profile for alumni template', () => {
    const data = generateGoldenData({
      runId: 'run_alumni',
      e2eRunId: 'e2e_alumni',
      templateId: 'forgecircle.registerAlumniCompleteProfile',
    });

    expect(data.profileType).toBe('alumni');
    expect(data.users[0].profileType).toBe('alumni');
    expect(data.users[0].role).toBe('alumni');
    expect(data.users[0].email).toMatch(/@forgecircle\.test$/);
    expect(data.users[0].permissions).toContain('mentor');
    expect(data.files.length).toBe(1);
  });

  it('generates student profile for multi-step form template', () => {
    const data = generateGoldenData({
      runId: 'run_student',
      e2eRunId: 'e2e_student',
      templateId: 'generic.multiStepFormValidation',
    });

    expect(data.profileType).toBe('student');
    expect(data.users[0].profileType).toBe('student');
    expect(data.forms!.length).toBeGreaterThan(0);
    expect(data.forms![0].email).toBe(data.users[0].email);
  });

  it('generates guest profile for password reset template', () => {
    const data = generateGoldenData({
      runId: 'run_guest',
      e2eRunId: 'e2e_guest',
      templateId: 'generic.passwordResetRequest',
    });

    expect(data.profileType).toBe('guest');
    expect(data.users[0].permissions).toEqual(['read']);
  });

  it('generates fileHeavy profile for file upload template', () => {
    const data = generateGoldenData({
      runId: 'run_files',
      e2eRunId: 'e2e_files',
      templateId: 'generic.fileUploadWithPreview',
    });

    expect(data.profileType).toBe('fileHeavy');
    expect(data.files.length).toBe(2);
  });

  it('generates table records for pagination template', () => {
    const data = generateGoldenData({
      runId: 'run_table',
      e2eRunId: 'e2e_table',
      templateId: 'generic.paginationAndSearch',
    });

    expect(data.profileType).toBe('guest');
    expect(data.tableRecords!.length).toBe(12);
    expect(data.tableRecords![0].id).toMatch(/^fq_record_/);
  });

  it('generates diagnostic profile for diagnostic templates', () => {
    const data = generateGoldenData({
      runId: 'run_diag',
      e2eRunId: 'e2e_diag',
      templateId: 'diagnostic.brokenSelector',
    });

    expect(data.profileType).toBe('diagnostic');
    expect(data.users.length).toBe(0);
    expect(data.files.length).toBe(0);
  });

  it('uses explicit profileType over template mapping', () => {
    const data = generateGoldenData({
      runId: 'run_explicit',
      e2eRunId: 'e2e_explicit',
      templateId: 'generic.passwordResetRequest',
      profileType: 'admin',
    });

    expect(data.profileType).toBe('admin');
    expect(data.users[0].permissions).toContain('admin');
  });

  it('generates deterministic display names per runId', () => {
    const data1 = generateGoldenData({ runId: 'run_det', e2eRunId: 'e1', userCount: 1 });
    const data2 = generateGoldenData({ runId: 'run_det', e2eRunId: 'e2', userCount: 1 });

    expect(data1.users[0].displayName).toBe(data2.users[0].displayName);
  });

  it('generates unique emails for batch users', () => {
    const data = generateGoldenData({
      runId: 'run_batch',
      e2eRunId: 'e2e_batch',
      userCount: 5,
    });

    const emails = data.users.map((u) => u.email);
    const uniqueEmails = new Set(emails);
    expect(uniqueEmails.size).toBe(emails.length);
  });

  it('all emails use approved safe domains', () => {
    const data = generateGoldenData({
      runId: 'run_safe',
      e2eRunId: 'e2e_safe',
      userCount: 10,
      includeFiles: true,
    });

    for (const user of data.users) {
      const domain = user.email.split('@')[1];
      expect(SAFE_DOMAINS).toContain(domain);
    }
  });

  it('generates each file type across multiple files', () => {
    const data = generateGoldenData({
      runId: 'run_types',
      e2eRunId: 'e2e_types',
      userCount: 5,
      includeFiles: true,
    });

    const extensions = data.files.map((f) => f.filename.split('.').pop());
    expect(extensions).toContain('png');
    expect(extensions).toContain('pdf');
    expect(extensions).toContain('txt');
    expect(extensions).toContain('csv');
    expect(extensions).toContain('json');
  });
});

describe('generateUserProfile', () => {
  it('generates an admin profile', () => {
    const user = generateUserProfile('run_1', 'e2e_1', 0, 'admin');
    expect(user.role).toBe('admin');
    expect(user.profileType).toBe('admin');
    expect(user.permissions).toContain('admin');
  });

  it('generates an employer profile', () => {
    const user = generateUserProfile('run_1', 'e2e_1', 0, 'employer');
    expect(user.role).toBe('employer');
    expect(user.permissions).toContain('post_jobs');
  });
});

describe('generateFiles', () => {
  it('generates requested count of files', () => {
    const files = generateFiles('run_1', 'e2e_1', 3, 'fileHeavy');
    expect(files.length).toBe(3);
    expect(files[0].sha256).toBeDefined();
    expect(files[0].sizeBytes).toBeGreaterThan(0);
  });
});

describe('generateDiagnosticData', () => {
  it('returns diagnostic profile data', () => {
    const data = generateDiagnosticData('run_d', 'e2e_d', 'diagnostic.missingLabel');
    expect(data.profileType).toBe('diagnostic');
    expect(data.users.length).toBe(0);
    expect(data.files.length).toBe(0);
  });
});
