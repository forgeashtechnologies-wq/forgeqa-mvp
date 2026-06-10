import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { RepairResult, RepairAction, RepairFinding, RepairStatus } from './repair-types.js';
import { nanoid } from 'nanoid';

const DISCLAIMER_TEXT =
  'This ForgeQA report validates scoped QA readiness only. It does not certify the application as secure, compliant, bug-free, or production-ready.';

function sha256File(filePath: string): string | undefined {
  try {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
  } catch {
    return undefined;
  }
}

function makeAction(
  id: string,
  category: RepairAction['category'],
  file: string,
  status: RepairStatus,
  message: string,
  safe: boolean,
  options?: { before?: string; after?: string; suggestedManualFix?: string },
): RepairAction {
  return {
    id,
    category,
    file,
    status,
    message,
    safe,
    before: options?.before,
    after: options?.after,
    suggestedManualFix: options?.suggestedManualFix,
  };
}

function makeFinding(
  id: string,
  severity: RepairFinding['severity'],
  message: string,
  file?: string,
  suggestedManualFix?: string,
): RepairFinding {
  return { id, severity, message, file, suggestedManualFix };
}

function computeRepairStatus(actions: RepairAction[]): RepairStatus {
  if (actions.some((a) => a.status === 'failed')) return 'failed';
  if (actions.some((a) => a.status === 'manual_review')) return 'manual_review';
  if (actions.some((a) => a.status === 'fixed')) return 'fixed';
  return 'skipped';
}

function sanitizeReportPaths(content: string, artifactDir: string): { changed: boolean; result: string; details: string[] } {
  const details: string[] = [];
  let result = content;
  const runId = path.basename(artifactDir);
  const projectRoot = process.cwd();

  // Pattern 1: absolute paths pointing to the same run artifact directory
  const runArtifactPattern = new RegExp(
    `(${escapeRegex(projectRoot)}[/\\\\]artifacts[/\\\\]runs[/\\\\]${escapeRegex(runId)})([/\\\\][^"'\\s)]+)`,
    'g',
  );
  if (runArtifactPattern.test(result)) {
    result = result.replace(runArtifactPattern, (_m, _prefix, subpath) => `.${subpath.replace(/\\/g, '/')}`);
    details.push(`Converted absolute paths to run artifact directory to relative paths`);
  }

  // Pattern 2: generic /Users/... /home/... absolute paths not under run dir
  const genericAbsPattern = /(?:"|'|\`)(\/Users\/[^"'\s]+|\/home\/[^"'\s]+|[A-Z]:\\[^"'\s]+)/g;
  const genericMatches = Array.from(result.matchAll(genericAbsPattern));
  if (genericMatches.length > 0) {
    // Don't auto-fix unknown absolute paths; they need manual review
    details.push(`Found ${genericMatches.length} absolute path(s) outside run directory — manual review required`);
  }

  return { changed: details.length > 0, result, details };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripUnsafeFileUrls(content: string): { changed: boolean; result: string; details: string[] } {
  const details: string[] = [];
  let result = content;
  const fileUrlPattern = /file:\/\/\/[^"')]+/g;
  const matches = Array.from(result.matchAll(fileUrlPattern));

  if (matches.length > 0) {
    // Only strip file:// URLs that point within artifacts/runs (safe to convert to relative)
    // For others, mark as manual review and remove the reference
    result = result.replace(fileUrlPattern, (match) => {
      const decoded = decodeURIComponent(match);
      if (decoded.includes('artifacts/runs/')) {
        details.push(`Converted file:// URL to relative path`);
        return match.replace(/^file:\/\/\//, './').replace(/^file:\/\//, './');
      }
      details.push(`Removed unsafe file:// URL: ${match.substring(0, 50)}...`);
      return './'; // minimal relative placeholder
    });
  }

  return { changed: details.length > 0, result, details };
}

function addMissingDisclaimer(content: string, format: 'markdown' | 'html'): { changed: boolean; result: string } {
  const lowerContent = content.toLowerCase();
  const disclaimerLower = DISCLAIMER_TEXT.toLowerCase();

  // Already contains disclaimer
  if (lowerContent.includes(disclaimerLower.substring(0, 40))) {
    return { changed: false, result: content };
  }

  let result = content;
  if (format === 'markdown') {
    result = content + '\n\n## Disclaimer\n\n' + DISCLAIMER_TEXT + '\n';
  } else if (format === 'html') {
    const footer = `\n<footer style="margin-top:2em;padding-top:1em;border-top:1px solid #ccc;font-size:0.85em;color:#666;"><p>${DISCLAIMER_TEXT}</p></footer>\n`;
    if (content.includes('</body>')) {
      result = content.replace('</body>', footer + '</body>');
    } else if (content.includes('</html>')) {
      result = content.replace('</html>', footer + '</html>');
    } else {
      result = content + footer;
    }
  }

  return { changed: true, result };
}

function copyValidationAliases(runDir: string, force: boolean): { actions: RepairAction[]; findings: RepairFinding[] } {
  const actions: RepairAction[] = [];
  const findings: RepairFinding[] = [];

  const pairs = [
    { source: 'artifact-validation.json', target: 'run-validation.json' },
    { source: 'artifact-validation.md', target: 'run-validation.md' },
  ];

  for (const { source, target } of pairs) {
    const sourcePath = path.join(runDir, source);
    const targetPath = path.join(runDir, target);

    if (!fs.existsSync(sourcePath)) {
      findings.push(makeFinding(`alias_missing_source_${target}`, 'warning', `Cannot create ${target}: ${source} missing`, targetPath));
      continue;
    }

    if (fs.existsSync(targetPath) && !force) {
      actions.push(makeAction(`alias_skip_${target}`, 'missing_alias', targetPath, 'skipped', `${target} already exists; use --force-fix to overwrite`, true));
      continue;
    }

    try {
      fs.copyFileSync(sourcePath, targetPath);
      actions.push(makeAction(`alias_copy_${target}`, 'missing_alias', targetPath, 'fixed', `Created ${target} from ${source}`, true));
    } catch (err) {
      actions.push(makeAction(`alias_fail_${target}`, 'missing_alias', targetPath, 'failed', `Failed to create ${target}: ${(err as Error).message}`, false));
    }
  }

  return { actions, findings };
}

function refreshArtifactManifestIfSafe(runDir: string): { actions: RepairAction[]; findings: RepairFinding[] } {
  const actions: RepairAction[] = [];
  const findings: RepairFinding[] = [];

  const manifestPath = path.join(runDir, 'artifact-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    findings.push(makeFinding('manifest_missing', 'info', 'No artifact-manifest.json to refresh', manifestPath));
    return { actions, findings };
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    if (!Array.isArray(manifest.artifacts)) {
      findings.push(makeFinding('manifest_no_artifacts', 'warning', 'artifact-manifest.json missing artifacts array; cannot refresh', manifestPath));
      return { actions, findings };
    }

    let changed = false;
    for (const artifact of manifest.artifacts) {
      const filePath = path.join(runDir, artifact.relativePath);
      if (fs.existsSync(filePath)) {
        const newSize = fs.statSync(filePath).size;
        const newHash = sha256File(filePath);
        if (artifact.sizeBytes !== newSize || artifact.sha256 !== newHash) {
          artifact.sizeBytes = newSize;
          artifact.sha256 = newHash;
          changed = true;
        }
      }
    }

    if (changed) {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
      actions.push(makeAction('manifest_refresh', 'manifest_refresh', manifestPath, 'fixed', 'Refreshed artifact-manifest.json checksums and sizes', true));
    } else {
      actions.push(makeAction('manifest_no_change', 'manifest_refresh', manifestPath, 'skipped', 'artifact-manifest.json already up to date', true));
    }
  } catch (err) {
    actions.push(makeAction('manifest_refresh_fail', 'manifest_refresh', manifestPath, 'failed', `Failed to refresh manifest: ${(err as Error).message}`, false));
  }

  return { actions, findings };
}

export interface RepairRunOptions {
  forceFix?: boolean;
}

export function repairRunArtifacts(runId: string, options: RepairRunOptions = {}): RepairResult {
  const actions: RepairAction[] = [];
  const findings: RepairFinding[] = [];
  const runDir = path.join(process.cwd(), 'artifacts', 'runs', runId);

  if (!fs.existsSync(runDir)) {
    return {
      id: `repair-${nanoid()}`,
      targetId: runId,
      targetType: 'run',
      createdAt: new Date().toISOString(),
      status: 'failed',
      actions: [makeAction('run_dir_missing', 'missing_alias', runDir, 'failed', `Run directory not found: ${runDir}`, false)],
      findings: [makeFinding('run_dir_missing', 'error', `Run directory not found: ${runDir}`)],
      summary: { totalActions: 1, fixedCount: 0, skippedCount: 0, manualReviewCount: 0, failedCount: 1, safeCount: 0, unsafeCount: 1 },
      disclaimer: DISCLAIMER_TEXT,
    };
  }

  // A. Repair absolute paths in report.md, report.html, cleanup-report.md
  const reportFiles = ['report.md', 'report.html', 'cleanup-report.md'];
  for (const file of reportFiles) {
    const filePath = path.join(runDir, file);
    if (!fs.existsSync(filePath)) continue;

    let content = fs.readFileSync(filePath, 'utf-8');
    const original = content;
    const format = file.endsWith('.html') ? 'html' : 'markdown';

    // file:// URLs (must run before absolute path repair to preserve file:// structure)
    const fileUrlResult = stripUnsafeFileUrls(content);
    if (fileUrlResult.changed) {
      content = fileUrlResult.result;
      actions.push(makeAction(
        `file_url_${file}`,
        'file_url',
        filePath,
        'fixed',
        `Repaired file:// references in ${file}`,
        true,
        { before: original.substring(0, 200), after: content.substring(0, 200) },
      ));
    }

    // Absolute paths
    const pathResult = sanitizeReportPaths(content, runDir);
    if (pathResult.changed) {
      content = pathResult.result;
      actions.push(makeAction(
        `abs_path_${file}`,
        'absolute_path',
        filePath,
        'fixed',
        `Repaired absolute paths in ${file}`,
        true,
        { before: original.substring(0, 200), after: content.substring(0, 200) },
      ));
    }

    // Disclaimer
    const disclaimerResult = addMissingDisclaimer(content, format);
    if (disclaimerResult.changed) {
      content = disclaimerResult.result;
      actions.push(makeAction(
        `disclaimer_${file}`,
        format === 'html' ? 'html_footer' : 'markdown_footer',
        filePath,
        'fixed',
        `Added disclaimer footer to ${file}`,
        true,
      ));
    }

    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf-8');
    }
  }

  // B. Validation aliases
  const aliasResult = copyValidationAliases(runDir, options.forceFix ?? false);
  actions.push(...aliasResult.actions);
  findings.push(...aliasResult.findings);

  // C. Manifest refresh
  const manifestResult = refreshArtifactManifestIfSafe(runDir);
  actions.push(...manifestResult.actions);
  findings.push(...manifestResult.findings);

  const status = computeRepairStatus(actions);
  const fixedCount = actions.filter((a) => a.status === 'fixed').length;
  const skippedCount = actions.filter((a) => a.status === 'skipped').length;
  const manualReviewCount = actions.filter((a) => a.status === 'manual_review').length;
  const failedCount = actions.filter((a) => a.status === 'failed').length;
  const safeCount = actions.filter((a) => a.safe).length;
  const unsafeCount = actions.filter((a) => !a.safe).length;

  return {
    id: `repair-${nanoid()}`,
    targetId: runId,
    targetType: 'run',
    createdAt: new Date().toISOString(),
    status,
    actions,
    findings,
    summary: {
      totalActions: actions.length,
      fixedCount,
      skippedCount,
      manualReviewCount,
      failedCount,
      safeCount,
      unsafeCount,
    },
    disclaimer: DISCLAIMER_TEXT,
  };
}

export function generateRepairMarkdown(result: RepairResult): string {
  const lines: string[] = [];
  lines.push('# Repair Report');
  lines.push('');
  lines.push(`- **Target:** ${result.targetType} \`${result.targetId}\``);
  lines.push(`- **Status:** ${result.status.toUpperCase()}`);
  lines.push(`- **Actions:** ${result.summary.totalActions}`);
  lines.push(`  - Fixed: ${result.summary.fixedCount}`);
  lines.push(`  - Skipped: ${result.summary.skippedCount}`);
  lines.push(`  - Manual Review: ${result.summary.manualReviewCount}`);
  lines.push(`  - Failed: ${result.summary.failedCount}`);
  lines.push('');

  if (result.actions.length > 0) {
    lines.push('## Actions');
    for (const a of result.actions) {
      lines.push(`- **[${a.status.toUpperCase()}]** \`${a.id}\` (${a.category}) — ${a.message}`);
      if (a.file) lines.push(`  - File: ${a.file}`);
      if (a.suggestedManualFix) lines.push(`  - Manual fix: ${a.suggestedManualFix}`);
    }
    lines.push('');
  }

  if (result.findings.length > 0) {
    lines.push('## Findings');
    for (const f of result.findings) {
      lines.push(`- **${f.severity.toUpperCase()}** \`${f.id}\`: ${f.message}`);
      if (f.file) lines.push(`  - File: ${f.file}`);
      if (f.suggestedManualFix) lines.push(`  - Fix: ${f.suggestedManualFix}`);
    }
    lines.push('');
  }

  lines.push('## Disclaimer');
  lines.push(result.disclaimer);
  lines.push('');

  return lines.join('\n');
}

export function writeRunRepairArtifacts(result: RepairResult): void {
  const runDir = path.join(process.cwd(), 'artifacts', 'runs', result.targetId);
  if (!fs.existsSync(runDir)) return;

  fs.writeFileSync(path.join(runDir, 'artifact-repair.json'), JSON.stringify(result, null, 2), 'utf-8');
  fs.writeFileSync(path.join(runDir, 'artifact-repair.md'), generateRepairMarkdown(result), 'utf-8');
  fs.writeFileSync(path.join(runDir, 'run-repair.json'), JSON.stringify(result, null, 2), 'utf-8');
  fs.writeFileSync(path.join(runDir, 'run-repair.md'), generateRepairMarkdown(result), 'utf-8');
}
