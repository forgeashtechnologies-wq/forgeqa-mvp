export type DataProfileType =
  | 'guest'
  | 'student'
  | 'alumni'
  | 'admin'
  | 'employer'
  | 'fileHeavy'
  | 'diagnostic';

export interface GoldenUserProfile {
  runId: string;
  e2eRunId: string;
  createdByForgeQA: true;
  safeToDelete: true;
  generatedAt: string;
  source: 'forgeqa';
  profileType: DataProfileType;
  templateId?: string;
  email: string;
  username: string;
  displayName: string;
  password: string;
  role: string;
  department?: string;
  batch?: string;
  permissions?: string[];
}

export interface GoldenFileAsset {
  runId: string;
  e2eRunId: string;
  createdByForgeQA: true;
  safeToDelete: true;
  generatedAt: string;
  source: 'forgeqa';
  profileType: DataProfileType;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  extension: string;
  sha256: string;
  relativePath: string;
  content: Buffer | string;
}

export interface GoldenFormData {
  runId: string;
  e2eRunId: string;
  createdByForgeQA: true;
  safeToDelete: true;
  generatedAt: string;
  source: 'forgeqa';
  templateId?: string;
  fields: Record<string, string>;
}

export interface GoldenTableRecord {
  runId: string;
  e2eRunId: string;
  createdByForgeQA: true;
  safeToDelete: true;
  generatedAt: string;
  source: 'forgeqa';
  recordType: string;
  data: Record<string, unknown>;
}

export interface GoldenDataSafetyAudit {
  runId: string;
  e2eRunId: string;
  generatedAt: string;
  status: 'pass' | 'warn' | 'fail';
  checks: SafetyCheck[];
  summary: {
    totalEntities: number;
    passedChecks: number;
    warningChecks: number;
    failedChecks: number;
    userCount: number;
    fileCount: number;
    formCount: number;
    tableRecordCount: number;
  };
}

export interface SafetyCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  entityCount?: number;
}

export interface GoldenDataSetV2 {
  runId: string;
  e2eRunId: string;
  createdByForgeQA: true;
  safeToDelete: true;
  generatedAt: string;
  source: 'forgeqa';
  profileType: DataProfileType;
  templateId?: string;
  users: GoldenUserProfile[];
  files: GoldenFileAsset[];
  forms: GoldenFormData[];
  tableRecords: GoldenTableRecord[];
}
