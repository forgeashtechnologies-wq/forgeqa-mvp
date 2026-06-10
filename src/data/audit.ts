import fs from 'node:fs';
import path from 'node:path';
import type { GoldenDataSet } from '../schemas/core.js';
import type { GoldenDataSafetyAudit, SafetyCheck } from './types.js';
import { SAFE_DOMAINS } from './generator.js';

const SECRET_PATTERNS = [
  /api[_-]?key/i,
  /token/i,
  /secret/i,
  /service[_-]?role/i,
  /private[_-]?key/i,
  /aws[_-]?access/i,
  /password.*=.*[^test]/i,
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function runDataSafetyAudit(data: GoldenDataSet, runDir: string): GoldenDataSafetyAudit {
  const checks: SafetyCheck[] = [];

  // 1. All entities have runId
  const entitiesWithRunId = [
    ...data.users.filter((u) => u.runId === data.runId),
    ...data.files.filter((f) => f.runId === data.runId),
  ].length;
  const totalEntities = data.users.length + data.files.length + (data.forms?.length ?? 0) + (data.tableRecords?.length ?? 0);
  checks.push({
    name: 'runId linkage',
    status: entitiesWithRunId === (data.users.length + data.files.length) ? 'pass' : 'fail',
    message: `${entitiesWithRunId}/${data.users.length + data.files.length} entities linked to runId`,
    entityCount: entitiesWithRunId,
  });

  // 2. All entities have e2eRunId
  const entitiesWithE2e = [
    ...data.users.filter((u) => u.e2eRunId === data.e2eRunId),
    ...data.files.filter((f) => f.e2eRunId === data.e2eRunId),
  ].length;
  checks.push({
    name: 'e2eRunId linkage',
    status: entitiesWithE2e === (data.users.length + data.files.length) ? 'pass' : 'fail',
    message: `${entitiesWithE2e}/${data.users.length + data.files.length} entities linked to e2eRunId`,
    entityCount: entitiesWithE2e,
  });

  // 3. createdByForgeQA
  const withCreated = [
    ...data.users.filter((u) => u.createdByForgeQA === true),
    ...data.files.filter((f) => f.createdByForgeQA === true),
  ].length;
  checks.push({
    name: 'createdByForgeQA',
    status: withCreated === (data.users.length + data.files.length) ? 'pass' : 'fail',
    message: `${withCreated}/${data.users.length + data.files.length} entities have createdByForgeQA=true`,
    entityCount: withCreated,
  });

  // 4. safeToDelete
  const withSafe = [
    ...data.users.filter((u) => u.safeToDelete === true),
    ...data.files.filter((f) => f.safeToDelete === true),
  ].length;
  checks.push({
    name: 'safeToDelete',
    status: withSafe === (data.users.length + data.files.length) ? 'pass' : 'fail',
    message: `${withSafe}/${data.users.length + data.files.length} entities have safeToDelete=true`,
    entityCount: withSafe,
  });

  // 5. Email domain check
  const badEmails = data.users.filter((u) => {
    const domain = u.email.split('@')[1];
    return !SAFE_DOMAINS.includes(domain);
  });
  checks.push({
    name: 'approved email domains',
    status: badEmails.length === 0 ? 'pass' : 'fail',
    message: badEmails.length === 0
      ? 'All emails use approved test domains'
      : `Found ${badEmails.length} email(s) with unapproved domain(s): ${badEmails.map((e) => e.email).join(', ')}`,
    entityCount: data.users.length - badEmails.length,
  });

  // 6. File existence check
  let fileExistsCount = 0;
  let fileOutsideRun = 0;
  for (const file of data.files) {
    const filePath = path.join(runDir, file.relativePath ?? file.filename);
    if (fs.existsSync(filePath)) {
      fileExistsCount++;
    }
    // Check if file path is inside runDir
    const resolved = path.resolve(filePath);
    const runDirResolved = path.resolve(runDir);
    if (!resolved.startsWith(runDirResolved)) {
      fileOutsideRun++;
    }
  }
  checks.push({
    name: 'generated files exist',
    status: fileExistsCount === data.files.length ? 'pass' : 'warn',
    message: `${fileExistsCount}/${data.files.length} files exist in run folder`,
    entityCount: fileExistsCount,
  });
  checks.push({
    name: 'files inside run folder',
    status: fileOutsideRun === 0 ? 'pass' : 'fail',
    message: fileOutsideRun === 0 ? 'All files are inside run folder' : `${fileOutsideRun} file(s) outside run folder`,
  });

  // 7. File sha256 check
  const withSha256 = data.files.filter((f) => f.sha256 && f.sha256.length === 64).length;
  checks.push({
    name: 'file sha256 present',
    status: data.files.length === 0 || withSha256 === data.files.length ? 'pass' : 'warn',
    message: `${withSha256}/${data.files.length} files have sha256`,
    entityCount: withSha256,
  });

  // 8. File size check
  const oversizedFiles = data.files.filter((f) => f.sizeBytes > MAX_FILE_SIZE);
  checks.push({
    name: 'file size limit',
    status: oversizedFiles.length === 0 ? 'pass' : 'fail',
    message: oversizedFiles.length === 0
      ? 'No files exceed 10 MB limit'
      : `${oversizedFiles.length} file(s) exceed 10 MB`,
  });

  // 9. Secret detection
  const allJson = JSON.stringify(data).toLowerCase();
  const detectedSecrets = SECRET_PATTERNS.filter((p) => p.test(allJson));
  checks.push({
    name: 'no leaked secrets',
    status: detectedSecrets.length === 0 ? 'pass' : 'warn',
    message: detectedSecrets.length === 0
      ? 'No secret-like patterns detected'
      : `Detected ${detectedSecrets.length} potential secret pattern(s) in data (may be false positive)`,
  });

  // 10. Source field
  checks.push({
    name: 'source field',
    status: data.source === 'forgeqa' ? 'pass' : 'warn',
    message: data.source === 'forgeqa' ? 'Data source is forgeqa' : `Data source is "${data.source}" instead of forgeqa`,
  });

  const failedChecks = checks.filter((c) => c.status === 'fail').length;
  const warnChecks = checks.filter((c) => c.status === 'warn').length;
  const passedChecks = checks.filter((c) => c.status === 'pass').length;

  const overallStatus: 'pass' | 'warn' | 'fail' = failedChecks > 0 ? 'fail' : warnChecks > 0 ? 'warn' : 'pass';

  return {
    runId: data.runId,
    e2eRunId: data.e2eRunId,
    generatedAt: new Date().toISOString(),
    status: overallStatus,
    checks,
    summary: {
      totalEntities,
      passedChecks,
      warningChecks: warnChecks,
      failedChecks,
      userCount: data.users.length,
      fileCount: data.files.length,
      formCount: data.forms?.length ?? 0,
      tableRecordCount: data.tableRecords?.length ?? 0,
    },
  };
}

export function generateDataSafetyAuditMarkdown(audit: GoldenDataSafetyAudit): string {
  const lines: string[] = [];
  lines.push('# Data Safety Audit');
  lines.push('');
  lines.push(`**Run ID:** ${audit.runId}`);
  lines.push(`**Generated:** ${audit.generatedAt}`);
  lines.push(`**Status:** ${audit.status === 'pass' ? '✅ Pass' : audit.status === 'warn' ? '⚠️ Warning' : '❌ Fail'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total entities: ${audit.summary.totalEntities}`);
  lines.push(`- Users: ${audit.summary.userCount}`);
  lines.push(`- Files: ${audit.summary.fileCount}`);
  lines.push(`- Forms: ${audit.summary.formCount}`);
  lines.push(`- Table records: ${audit.summary.tableRecordCount}`);
  lines.push('');
  lines.push('## Checks');
  lines.push('');
  for (const check of audit.checks) {
    const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
    lines.push(`- ${icon} **${check.name}**: ${check.message}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('*ForgeQA generated only synthetic test data. No real user data was used.*');
  lines.push('');
  return lines.join('\n');
}
