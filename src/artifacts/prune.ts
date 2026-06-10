import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';

export interface PruneOptions {
  dryRun?: boolean;
  confirm?: boolean;
  olderThanDays?: number;
  runs?: boolean;
  batches?: boolean;
  release?: boolean;
  dashboard?: boolean;
  status?: 'completed' | 'failed' | 'dry-run' | 'not_ready';
  keepLatest?: number;
}

export interface PruneReport {
  id: string;
  createdAt: string;
  mode: 'dry-run' | 'confirmed';
  options: PruneOptions;
  targets: PruneTarget[];
  kept: PruneTarget[];
  summary: {
    totalTargets: number;
    totalKept: number;
    bytesReclaimed: number;
    bytesRetained: number;
  };
  safe: boolean;
  disclaimer: string;
}

export interface PruneTarget {
  path: string;
  type: 'run' | 'batch' | 'release' | 'dashboard';
  ageDays: number;
  sizeBytes: number;
  reason: string;
  status?: string;
}

const DISCLAIMER = 'This prune report is for artifact maintenance only. It does not delete source files, docs, or configuration.';

export function runPrune(options: PruneOptions = {}): PruneReport {
  const artifactRoot = path.join(process.cwd(), 'artifacts');

  // Safety: must have at least one filter
  const hasFilter =
    options.olderThanDays !== undefined ||
    options.status !== undefined ||
    options.runs ||
    options.batches ||
    options.release ||
    options.dashboard;

  const mode: PruneReport['mode'] = options.confirm && !options.dryRun ? 'confirmed' : 'dry-run';

  // Safety: refuse actual deletion without filters
  if (mode === 'confirmed' && !hasFilter) {
    return {
      id: nanoid(),
      createdAt: new Date().toISOString(),
      mode,
      options,
      targets: [],
      kept: [],
      summary: { totalTargets: 0, totalKept: 0, bytesReclaimed: 0, bytesRetained: 0 },
      safe: false,
      disclaimer: DISCLAIMER,
    };
  }

  const targets: PruneTarget[] = [];
  const kept: PruneTarget[] = [];

  const now = Date.now();
  const cutoffMs = options.olderThanDays ? now - options.olderThanDays * 24 * 60 * 60 * 1000 : 0;

  // Collect runs
  if (options.runs || options.batches || options.release || options.dashboard) {
    if (options.runs) {
      collectFromDir(path.join(artifactRoot, 'runs'), 'run', targets, kept, cutoffMs, options, now);
    }
    if (options.batches) {
      collectFromDir(path.join(artifactRoot, 'batches'), 'batch', targets, kept, cutoffMs, options, now);
    }
    if (options.release) {
      collectFromDir(path.join(artifactRoot, 'release'), 'release', targets, kept, cutoffMs, options, now);
    }
    if (options.dashboard) {
      collectFromDir(path.join(artifactRoot, 'dashboard'), 'dashboard', targets, kept, cutoffMs, options, now);
    }
  } else if (hasFilter) {
    // If no type filter but age/status filter, scan all artifact types
    collectFromDir(path.join(artifactRoot, 'runs'), 'run', targets, kept, cutoffMs, options, now);
    collectFromDir(path.join(artifactRoot, 'batches'), 'batch', targets, kept, cutoffMs, options, now);
  }

  // Apply keep-latest
  let finalTargets = targets;
  if (options.keepLatest !== undefined && options.keepLatest > 0) {
    // Sort by age descending (oldest first for removal)
    targets.sort((a, b) => b.ageDays - a.ageDays);
    const keptByType: Record<string, PruneTarget[]> = {};
    const toRemove: PruneTarget[] = [];
    for (const t of targets) {
      const list = (keptByType[t.type] ??= []);
      if (list.length < options.keepLatest) {
        list.push(t);
        kept.push(t);
      } else {
        toRemove.push(t);
      }
    }
    finalTargets = toRemove;
  }

  // Safety: never delete outside artifacts/
  const safeTargets = finalTargets.filter((t) => {
    const resolved = path.resolve(t.path);
    return resolved.startsWith(path.resolve(artifactRoot));
  });

  // Safety: don't delete latest-release-check or latest project-overview by default
  const protectedPaths = [
    path.join(artifactRoot, 'release', 'latest-release-check.json'),
    path.join(artifactRoot, 'release', 'latest-release-check.md'),
    path.join(artifactRoot, 'dashboard', 'project-overview.json'),
    path.join(artifactRoot, 'dashboard', 'project-overview.md'),
  ];
  const nonProtectedTargets = safeTargets.filter((t) => !protectedPaths.includes(path.resolve(t.path)));

  let bytesReclaimed = 0;
  let bytesRetained = 0;

  for (const t of nonProtectedTargets) {
    bytesReclaimed += t.sizeBytes;
    if (mode === 'confirmed') {
      try {
        const stat = fs.lstatSync(t.path);
        if (stat.isSymbolicLink()) {
          // Safety: never follow symlinks
          continue;
        }
        if (stat.isDirectory()) {
          fs.rmSync(t.path, { recursive: true, force: true });
        } else {
          fs.unlinkSync(t.path);
        }
      } catch {
        // ignore deletion errors
      }
    }
  }

  for (const t of kept) {
    bytesRetained += t.sizeBytes;
  }

  const report: PruneReport = {
    id: nanoid(),
    createdAt: new Date().toISOString(),
    mode,
    options,
    targets: nonProtectedTargets,
    kept,
    summary: {
      totalTargets: nonProtectedTargets.length,
      totalKept: kept.length,
      bytesReclaimed,
      bytesRetained,
    },
    safe: true,
    disclaimer: DISCLAIMER,
  };

  writePruneReport(report);
  return report;
}

function collectFromDir(
  dir: string,
  type: PruneTarget['type'],
  targets: PruneTarget[],
  kept: PruneTarget[],
  cutoffMs: number,
  options: PruneOptions,
  now: number,
): void {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir)) {
    const entryPath = path.join(dir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(entryPath);
    } catch {
      // Entry may have been deleted between readdir and lstat
      continue;
    }

    // Safety: skip symlinks
    if (stat.isSymbolicLink()) continue;
    if (!stat.isDirectory() && type !== 'release' && type !== 'dashboard') continue;

    const ageMs = now - stat.mtime.getTime();
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));

    // Age filter
    if (cutoffMs > 0 && stat.mtime.getTime() > cutoffMs) {
      kept.push({
        path: entryPath,
        type,
        ageDays,
        sizeBytes: computeSize(entryPath),
        reason: 'Too recent (within cutoff)',
      });
      continue;
    }

    // Status filter for runs
    let statusMatch = true;
    if (options.status && type === 'run') {
      const runJsonPath = path.join(entryPath, 'run.json');
      if (fs.existsSync(runJsonPath)) {
        try {
          const runJson = JSON.parse(fs.readFileSync(runJsonPath, 'utf-8'));
          statusMatch = runJson.status === options.status || runJson.verdict === options.status;
        } catch {
          statusMatch = false;
        }
      } else {
        statusMatch = false;
      }
    }

    if (!statusMatch) {
      kept.push({
        path: entryPath,
        type,
        ageDays,
        sizeBytes: computeSize(entryPath),
        reason: 'Status does not match filter',
      });
      continue;
    }

    targets.push({
      path: entryPath,
      type,
      ageDays,
      sizeBytes: computeSize(entryPath),
      reason: `Matches prune filters (age: ${ageDays} days)`,
    });
  }
}

function computeSize(targetPath: string): number {
  try {
    const stat = fs.lstatSync(targetPath);
    if (stat.isSymbolicLink()) return 0;
    if (stat.isDirectory()) {
      let total = 0;
      for (const entry of fs.readdirSync(targetPath)) {
        total += computeSize(path.join(targetPath, entry));
      }
      return total;
    }
    return stat.size;
  } catch {
    return 0;
  }
}

function writePruneReport(report: PruneReport): void {
  const reportDir = path.join(process.cwd(), 'artifacts', 'prune');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  fs.writeFileSync(path.join(reportDir, 'prune-report.json'), JSON.stringify(report, null, 2), 'utf-8');

  const lines: string[] = [];
  lines.push('# ForgeQA Prune Report');
  lines.push('');
  lines.push(`- **ID:** \`${report.id}\``);
  lines.push(`- **Mode:** ${report.mode.toUpperCase()}`);
  lines.push(`- **Created At:** ${report.createdAt}`);
  lines.push(`- **Safe:** ${report.safe ? 'Yes' : 'No'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- **Targets:** ${report.summary.totalTargets}`);
  lines.push(`- **Kept:** ${report.summary.totalKept}`);
  lines.push(`- **Bytes Reclaimed:** ${report.summary.bytesReclaimed}`);
  lines.push(`- **Bytes Retained:** ${report.summary.bytesRetained}`);
  lines.push('');

  if (report.targets.length > 0) {
    lines.push('## Targets');
    for (const t of report.targets) {
      lines.push(`- **${t.type}:** ${t.path} (${t.ageDays} days, ${t.sizeBytes} bytes) — ${t.reason}`);
    }
    lines.push('');
  }

  if (report.kept.length > 0) {
    lines.push('## Kept');
    for (const t of report.kept.slice(0, 20)) {
      lines.push(`- **${t.type}:** ${t.path} — ${t.reason}`);
    }
    if (report.kept.length > 20) {
      lines.push(`- ... and ${report.kept.length - 20} more`);
    }
    lines.push('');
  }

  lines.push('## Disclaimer');
  lines.push(`> ${report.disclaimer}`);
  lines.push('');

  fs.writeFileSync(path.join(reportDir, 'prune-report.md'), lines.join('\n'), 'utf-8');
}
