import { nanoid } from 'nanoid';
import crypto from 'node:crypto';
import type { GoldenDataSet, GoldenUser, GoldenFile } from '../schemas/core.js';
import type { DataProfileType } from './types.js';

interface GenerateOptions {
  runId: string;
  e2eRunId: string;
  templateId?: string;
  userCount?: number;
  includeFiles?: boolean;
  profileType?: DataProfileType;
}

const SAFE_DOMAINS = ['forgeqa.test', 'forgecircle.test', 'example.test'];

const FIRST_NAMES = ['Aiden', 'Bella', 'Carter', 'Daisy', 'Ethan', 'Fiona', 'Grace', 'Henry', 'Ivy', 'Jack', 'Kara', 'Leo', 'Maya', 'Noah', 'Olivia', 'Parker', 'Quinn', 'Riley', 'Sophia', 'Theo', 'Uma', 'Violet', 'Wyatt', 'Xena', 'Yara', 'Zane'];
const LAST_NAMES = ['Anderson', 'Brooks', 'Chen', 'Davis', 'Evans', 'Foster', 'Garcia', 'Harris', 'Ivanov', 'Johnson', 'Kim', 'Lee', 'Miller', 'Nguyen', 'Ortiz', 'Patel', 'Quinn', 'Robinson', 'Singh', 'Taylor', 'Ueda', 'Vargas', 'Walker', 'Xu', 'Yamamoto', 'Zhang'];
const DEPARTMENTS = ['Computer Science', 'Electrical Engineering', 'Mathematics', 'Physics', 'Biology', 'Chemistry', 'Economics', 'Psychology', 'History', 'English Literature'];
const BATCHES = ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];

function deterministicChoice<T>(arr: T[], seed: string): T {
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  const index = parseInt(hash.substring(0, 8), 16) % arr.length;
  return arr[index];
}

function generateDisplayName(seed: string): string {
  const first = deterministicChoice(FIRST_NAMES, seed + 'first');
  const last = deterministicChoice(LAST_NAMES, seed + 'last');
  return `${first} ${last}`;
}

function generateEmail(runId: string, index: number, role: string, domain: string): string {
  const short = runId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toLowerCase();
  return `fq_${short}_${role}_${index}@${domain}`;
}

function generatePassword(): string {
  const parts = [nanoid(6), nanoid(6), nanoid(4)];
  return `Fq_${parts.join('_')}`;
}

function generateUser(runId: string, e2eRunId: string, index: number, profileType: DataProfileType, templateId?: string): GoldenUser {
  const short = runId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toLowerCase();
  const seed = `${runId}_${index}`;
  const displayName = generateDisplayName(seed);
  const domain = templateId === 'forgecircle.registerAlumniCompleteProfile' ? 'forgecircle.test' : 'forgeqa.test';

  const base: GoldenUser = {
    runId,
    e2eRunId,
    createdByForgeQA: true,
    safeToDelete: true,
    email: generateEmail(runId, index, profileType, domain),
    username: `fq_${profileType}_${short}_${index}`,
    displayName,
    password: generatePassword(),
    role: profileType,
    profileType,
  };

  switch (profileType) {
    case 'student':
      return {
        ...base,
        department: deterministicChoice(DEPARTMENTS, seed + 'dept'),
        batch: deterministicChoice(BATCHES, seed + 'batch'),
        permissions: ['read', 'write'],
      };
    case 'alumni':
      return {
        ...base,
        department: deterministicChoice(DEPARTMENTS, seed + 'dept'),
        batch: deterministicChoice(BATCHES, seed + 'batch'),
        permissions: ['read', 'write', 'mentor'],
      };
    case 'admin':
      return {
        ...base,
        department: 'Administration',
        permissions: ['read', 'write', 'delete', 'admin'],
      };
    case 'employer':
      return {
        ...base,
        department: 'Human Resources',
        permissions: ['read', 'post_jobs'],
      };
    case 'guest':
      return {
        ...base,
        permissions: ['read'],
      };
    case 'fileHeavy':
      return {
        ...base,
        permissions: ['read', 'write', 'upload'],
      };
    case 'diagnostic':
      return {
        ...base,
        displayName: `Diagnostic ${index + 1}`,
        permissions: ['read'],
      };
    default:
      return base;
  }
}

function sha256Buffer(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function generateFile(runId: string, e2eRunId: string, index: number, _profileType: DataProfileType): GoldenFile {
  const short = runId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toLowerCase();
  const fileTypes = [
    { ext: 'png', mime: 'image/png', prefix: 'avatar' },
    { ext: 'pdf', mime: 'application/pdf', prefix: 'document' },
    { ext: 'txt', mime: 'text/plain', prefix: 'note' },
    { ext: 'csv', mime: 'text/csv', prefix: 'data' },
    { ext: 'json', mime: 'application/json', prefix: 'config' },
  ];
  const type = fileTypes[index % fileTypes.length];
  const filename = `fq_${type.prefix}_${short}_${index}.${type.ext}`;

  let content: Buffer | string;
  switch (type.ext) {
    case 'png':
      content = Buffer.from(generateMinimalPng(), 'base64');
      break;
    case 'pdf':
      content = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 100 700 Td (ForgeQA test PDF) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000214 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n310\n%%EOF`;
      break;
    case 'txt':
      content = `ForgeQA generated text file for run ${runId}\nSafe to delete: true\nCreated by: ForgeQA\n`;
      break;
    case 'csv':
      content = `id,name,value\n1,item_a,100\n2,item_b,200\n3,item_c,300\n`;
      break;
    case 'json':
      content = JSON.stringify({ runId, source: 'forgeqa', safeToDelete: true, items: [1, 2, 3] }, null, 2);
      break;
    default:
      content = Buffer.alloc(1024, 0);
  }

  const sizeBytes = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content, 'utf-8');

  return {
    runId,
    e2eRunId,
    createdByForgeQA: true,
    safeToDelete: true,
    filename,
    mimeType: type.mime,
    sizeBytes,
    content,
    sha256: sha256Buffer(content),
    relativePath: `files/${filename}`,
  };
}

// Minimal 1x1 transparent PNG in base64
function generateMinimalPng(): string {
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
}

function determineProfileType(templateId?: string): DataProfileType {
  switch (templateId) {
    case 'forgecircle.registerAlumniCompleteProfile':
      return 'alumni';
    case 'generic.passwordResetRequest':
      return 'guest';
    case 'generic.multiStepFormValidation':
      return 'student';
    case 'generic.fileUploadWithPreview':
      return 'fileHeavy';
    case 'generic.paginationAndSearch':
      return 'guest';
    case 'generic.mobileResponsiveCheck':
      return 'guest';
    case 'diagnostic.brokenSelector':
    case 'diagnostic.slowLoading':
    case 'diagnostic.duplicateTestId':
    case 'diagnostic.missingLabel':
    case 'diagnostic.mediaAccessibility':
    case 'diagnostic.genericTitle':
      return 'diagnostic';
    default:
      return 'guest';
  }
}

function determineRequirements(templateId?: string, profileType?: DataProfileType): { userCount: number; fileCount: number } {
  const pt = profileType ?? determineProfileType(templateId);
  switch (pt) {
    case 'alumni':
      return { userCount: 1, fileCount: 1 };
    case 'student':
      return { userCount: 1, fileCount: 0 };
    case 'fileHeavy':
      return { userCount: 0, fileCount: 2 };
    case 'admin':
      return { userCount: 1, fileCount: 1 };
    case 'employer':
      return { userCount: 1, fileCount: 1 };
    case 'diagnostic':
      return { userCount: 0, fileCount: 0 };
    case 'guest':
    default:
      return { userCount: 1, fileCount: 0 };
  }
}

export function generateGoldenData(options: GenerateOptions): GoldenDataSet {
  const { runId, e2eRunId, templateId, userCount: explicitUserCount, includeFiles, profileType: explicitProfileType } = options;

  const profileType = explicitProfileType ?? determineProfileType(templateId);
  const defaults = determineRequirements(templateId, profileType);

  const userCount = explicitUserCount !== undefined ? explicitUserCount : defaults.userCount;
  const fileCount = includeFiles !== undefined
    ? (includeFiles ? (explicitUserCount ?? defaults.userCount) : 0)
    : defaults.fileCount;

  const users: GoldenUser[] = Array.from({ length: userCount }, (_, i) =>
    generateUser(runId, e2eRunId, i, profileType, templateId),
  );

  const files: GoldenFile[] = Array.from({ length: fileCount }, (_, i) =>
    generateFile(runId, e2eRunId, i, profileType),
  );

  // Generate form data for multi-step form
  const forms: Record<string, string>[] = [];
  if (templateId === 'generic.multiStepFormValidation' && users.length > 0) {
    const user = users[0];
    forms.push({
      firstName: user.displayName.split(' ')[0],
      lastName: user.displayName.split(' ')[1] ?? 'Test',
      email: user.email,
      department: user.department ?? 'Computer Science',
      batch: user.batch ?? '2024',
    });
  }

  // Generate table records for pagination/search
  const tableRecords: Record<string, unknown>[] = [];
  if (templateId === 'generic.paginationAndSearch') {
    for (let i = 0; i < 12; i++) {
      tableRecords.push({
        id: `fq_record_${i}`,
        name: generateDisplayName(`${runId}_record_${i}`),
        value: 100 + i * 10,
        active: i % 2 === 0,
      });
    }
  }

  return {
    runId,
    e2eRunId,
    createdByForgeQA: true,
    safeToDelete: true,
    generatedAt: new Date().toISOString(),
    source: 'forgeqa',
    profileType,
    templateId,
    users,
    files,
    forms,
    tableRecords,
  };
}

export function generateUserProfile(runId: string, e2eRunId: string, index: number, profileType: DataProfileType): GoldenUser {
  return generateUser(runId, e2eRunId, index, profileType);
}

export function generateFiles(runId: string, e2eRunId: string, count: number, profileType: DataProfileType): GoldenFile[] {
  return Array.from({ length: count }, (_, i) => generateFile(runId, e2eRunId, i, profileType));
}

export function generateDiagnosticData(runId: string, e2eRunId: string, scenarioId: string): GoldenDataSet {
  return generateGoldenData({
    runId,
    e2eRunId,
    templateId: scenarioId,
    profileType: 'diagnostic',
  });
}

export { sha256Buffer, SAFE_DOMAINS };
