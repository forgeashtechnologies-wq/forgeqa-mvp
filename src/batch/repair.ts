import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import type { RepairResult, RepairAction, RepairFinding, RepairStatus } from '../artifacts/repair-types.js';

const DISCLAIMER_TEXT =
  'This ForgeQA report validates scoped QA readiness only. It does not certify the application as secure, compliant, bug-free, or production-ready.';

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

function sanitizeBatchPaths(content: string, batchDir: string): { changed: boolean; result: string; details: string[] } {
  const details: string[] = [];
  let result = content;
  const batchId = path.basename(batchDir);
  const projectRoot = process.cwd();

  // Pattern 1: absolute paths pointing to the same batch artifact directory
  const batchArtifactPattern = new RegExp(
    `(${escapeRegex(projectRoot)}[/\\\\]artifacts[/\\\\]batches[/\\\\]${escapeRegex(batchId)})([/\\\\][^"'\\s)]+)`,
    'g',
  );
  if (batchArtifactPattern.test(result)) {
    result = result.replace(batchArtifactPattern, (_m, _prefix, subpath) => `.${subpath.replace(/\\/g, '/')}`);
    details.push('Converted absolute paths to batch artifact directory to relative paths');
  }

  // Pattern 2: generic /Users/... /home/... absolute paths not under batch dir
  const genericAbsPattern = /(?:"|'|\`)(\/Users\/[^"'\s]+|\/home\/[^"'\s]+|[A-Z]:\\[^"'\s]+)/g;
  const genericMatches = Array.from(result.matchAll(genericAbsPattern));
  if (genericMatches.length > 0) {
    details.push(`Found ${genericMatches.length} absolute path(s) outside batch directory — manual review required`);
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
    result = result.replace(fileUrlPattern, (match) => {
      const decoded = decodeURIComponent(match);
      if (decoded.includes('artifacts/batches/')) {
        details.push('Converted file:// URL to relative path');
        return match.replace(/^file:\/\/\//, './').replace(/^file:\/\//, './');
      }
      details.push(`Removed unsafe file:// URL: ${match.substring(0, 50)}...`);
      return './';
    });
  }

  return { changed: details.length > 0, result, details };
}

function addMissingDisclaimer(content: string, format: 'markdown' | 'html'): { changed: boolean; result: string } {
  const lowerContent = content.toLowerCase();
  const disclaimerLower = DISCLAIMER_TEXT.toLowerCase();

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

function copyValidationAliases(_batchDir: string, _force: boolean): { actions: RepairAction[]; findings: RepairFinding[] } {
  const actions: RepairAction[] = [];
  const findings: RepairFinding[] = [];

  // No standard batch validation alias pairs yet; placeholder for future
  return { actions, findings };
}

function refreshBatchManifestIfSafe(batchDir: string): { actions: RepairAction[]; findings: RepairFinding[] } {
  const actions: RepairAction[] = [];
  const findings: RepairFinding[] = [];

  const manifestPath = path.join(batchDir, 'batch-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    findings.push(makeFinding('batch_manifest_missing', 'info', 'No batch-manifest.json to refresh', manifestPath));
    return { actions, findings };
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    if (!Array.isArray(manifest.artifacts)) {
      findings.push(makeFinding('batch_manifest_no_artifacts', 'warning', 'batch-manifest.json missing artifacts array; cannot refresh', manifestPath));
      return { actions, findings };
    }

    let changed = false;
    for (const artifact of manifest.artifacts) {
      const filePath = path.join(batchDir, artifact.relativePath);
      if (fs.existsSync(filePath)) {
        const newSize = fs.statSync(filePath).size;
        if (artifact.sizeBytes !== newSize) {
          artifact.sizeBytes = newSize;
          changed = true;
        }
      }
    }

    if (changed) {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
      actions.push(makeAction('batch_manifest_refresh', 'manifest_refresh', manifestPath, 'fixed', 'Refreshed batch-manifest.json sizes', true));
    } else {
      actions.push(makeAction('batch_manifest_no_change', 'manifest_refresh', manifestPath, 'skipped', 'batch-manifest.json already up to date', true));
    }
  } catch (err) {
    actions.push(makeAction('batch_manifest_refresh_fail', 'manifest_refresh', manifestPath, 'failed', `Failed to refresh manifest: ${(err as Error).message}`, false));
  }

  return { actions, findings };
}

export interface RepairBatchOptions {
  forceFix?: boolean;
  fixLinkedRuns?: boolean;
}

export function repairBatchArtifacts(batchId: string, options: RepairBatchOptions = {}): RepairResult {
  const actions: RepairAction[] = [];
  const findings: RepairFinding[] = [];
  const batchDir = path.join(process.cwd(), 'artifacts', 'batches', batchId);

  if (!fs.existsSync(batchDir)) {
    return {
      id: `repair-${nanoid()}`,
      targetId: batchId,
      targetType: 'batch',
      createdAt: new Date().toISOString(),
      status: 'failed',
      actions: [makeAction('batch_dir_missing', 'missing_alias', batchDir, 'failed', `Batch directory not found: ${batchDir}`, false)],
      findings: [makeFinding('batch_dir_missing', 'error', `Batch directory not found: ${batchDir}`)],
      summary: { totalActions: 1, fixedCount: 0, skippedCount: 0, manualReviewCount: 0, failedCount: 1, safeCount: 0, unsafeCount: 1 },
      disclaimer: DISCLAIMER_TEXT,
    };
  }

  // A. Repair absolute paths and file:// URLs in batch markdown files
  const markdownFiles = ['batch-plan.md', 'batch-result.md', 'batch-validation.md', 'industry-batch-assessment.md'];
  for (const file of markdownFiles) {
    const filePath = path.join(batchDir, file);
    if (!fs.existsSync(filePath)) continue;

    let content = fs.readFileSync(filePath, 'utf-8');
    const original = content;

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
    const pathResult = sanitizeBatchPaths(content, batchDir);
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
    const disclaimerResult = addMissingDisclaimer(content, 'markdown');
    if (disclaimerResult.changed) {
      content = disclaimerResult.result;
      actions.push(makeAction(
        `disclaimer_${file}`,
        'markdown_footer',
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

  // B. Validation aliases (placeholder)
  const aliasResult = copyValidationAliases(batchDir, options.forceFix ?? false);
  actions.push(...aliasResult.actions);
  findings.push(...aliasResult.findings);

  // C. Manifest refresh
  const manifestResult = refreshBatchManifestIfSafe(batchDir);
  actions.push(...manifestResult.actions);
  findings.push(...manifestResult.findings);

  // D. Linked run repair (if enabled)
  if (options.fixLinkedRuns) {
    const batchResultPath = path.join(batchDir, 'batch-result.json');
    if (fs.existsSync(batchResultPath)) {
      try {
        const batchResult = JSON.parse(fs.readFileSync(batchResultPath, 'utf-8'));
        const runIds: string[] = batchResult.runIds ?? [];
        for (const runId of runIds) {
          const runDir = path.join(process.cwd(), 'artifacts', 'runs', runId);
          if (!fs.existsSync(runDir)) {
            findings.push(makeFinding(`linked_run_missing_${runId}`, 'warning', `Linked run not found: ${runId}`, undefined, 'Run may have been deleted or not yet created.'));
            continue;
          }
          // We don't actually repair linked runs from batch repair to avoid cross-contamination
          // Just report that they exist
          actions.push(makeAction(`linked_run_present_${runId}`, 'missing_alias', runDir, 'skipped', `Linked run exists: ${runId}; not repaired from batch context`, true));
        }
      } catch (err) {
        findings.push(makeFinding('linked_run_parse_error', 'error', `Failed to parse batch-result.json to check linked runs: ${(err as Error).message}`));
      }
    }
  }

  const status = computeRepairStatus(actions);
  const fixedCount = actions.filter((a) => a.status === 'fixed').length;
  const skippedCount = actions.filter((a) => a.status === 'skipped').length;
  const manualReviewCount = actions.filter((a) => a.status === 'manual_review').length;
  const failedCount = actions.filter((a) => a.status === 'failed').length;
  const safeCount = actions.filter((a) => a.safe).length;
  const unsafeCount = actions.filter((a) => !a.safe).length;

  return {
    id: `repair-${nanoid()}`,
    targetId: batchId,
    targetType: 'batch',
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

export function generateBatchRepairMarkdown(result: RepairResult): string {
  const lines: string[] = [];
  lines.push('# Batch Repair Report');
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

export function writeBatchRepairArtifacts(result: RepairResult): void {
  const batchDir = path.join(process.cwd(), 'artifacts', 'batches', result.targetId);
  if (!fs.existsSync(batchDir)) return;

  fs.writeFileSync(path.join(batchDir, 'batch-repair.json'), JSON.stringify(result, null, 2), 'utf-8');
  fs.writeFileSync(path.join(batchDir, 'batch-repair.md'), generateBatchRepairMarkdown(result), 'utf-8');
}
