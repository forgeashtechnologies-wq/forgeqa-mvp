import fs from 'node:fs';
import path from 'node:path';
import { getRunDir } from '../artifacts/manager.js';

export interface OpenOptions {
  html?: boolean;
  markdown?: boolean;
  trace?: boolean;
  folder?: boolean;
  dryRun?: boolean;
  json?: boolean;
  launch?: boolean;
}

export interface OpenTarget {
  type: 'html' | 'markdown' | 'trace' | 'folder';
  relativePath: string;
  absolutePath: string;
  exists: boolean;
  command?: string;
}

export function resolveOpenTarget(runId: string, options: OpenOptions): OpenTarget {
  const runDir = getRunDir(runId);

  if (!fs.existsSync(runDir)) {
    throw new Error(`Run not found: ${runId}`);
  }

  const safeRunDir = path.resolve(runDir);
  const artifactsRoot = path.resolve(process.cwd(), 'artifacts', 'runs');
  if (!safeRunDir.startsWith(artifactsRoot + path.sep)) {
    throw new Error(`Invalid run directory: ${runDir}`);
  }

  let targetType: OpenTarget['type'] = 'html';
  let targetRelative = 'report.html';

  if (options.trace) {
    targetType = 'trace';
    targetRelative = 'trace.zip';
  } else if (options.markdown) {
    targetType = 'markdown';
    targetRelative = 'report.md';
  } else if (options.folder) {
    targetType = 'folder';
    targetRelative = '.';
  } else {
    // Default: report.html if present, else report.md
    if (!fs.existsSync(path.join(runDir, 'report.html')) && fs.existsSync(path.join(runDir, 'report.md'))) {
      targetType = 'markdown';
      targetRelative = 'report.md';
    }
  }

  const targetAbsolute = targetRelative === '.' ? runDir : path.join(runDir, targetRelative);
  const exists = fs.existsSync(targetAbsolute);

  let command: string | undefined;
  if (targetType === 'trace' && exists) {
    command = `pnpm exec playwright show-trace ${path.relative(process.cwd(), targetAbsolute)}`;
  } else if (targetType === 'folder') {
    command = targetAbsolute;
  } else if (exists) {
    command = targetAbsolute;
  }

  return {
    type: targetType,
    relativePath: targetRelative,
    absolutePath: targetAbsolute,
    exists,
    command,
  };
}

export function validateOpenTarget(runDir: string, targetPath: string): void {
  if (/^https?:\/\//.test(targetPath)) {
    throw new Error('URL targets are not allowed for open command.');
  }
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRunDir = path.resolve(runDir);
  if (!resolvedTarget.startsWith(resolvedRunDir + path.sep) && resolvedTarget !== resolvedRunDir) {
    throw new Error(`Open target ${targetPath} is outside run directory.`);
  }
}

export function getPlatformOpenCommand(): string | undefined {
  const platform = process.platform;
  if (platform === 'darwin') return 'open';
  if (platform === 'win32') return 'start';
  if (platform === 'linux') return 'xdg-open';
  return undefined;
}

export function buildOpenCommand(targetPath: string): string | undefined {
  const platformCmd = getPlatformOpenCommand();
  if (!platformCmd) return undefined;
  // Shell-safe: only quote if needed, reject suspicious paths
  const sanitized = path.resolve(targetPath);
  if (sanitized.includes(';') || sanitized.includes('|') || sanitized.includes('&&') || sanitized.includes('`')) {
    throw new Error('Target path contains unsafe characters.');
  }
  return `${platformCmd} "${sanitized}"`;
}

export interface OpenResult {
  opened: boolean;
  target: OpenTarget;
  command?: string;
  dryRun: boolean;
}

export function openRunArtifact(runId: string, options: OpenOptions): OpenResult {
  const target = resolveOpenTarget(runId, options);

  if (options.folder) {
    validateOpenTarget(getRunDir(runId), target.absolutePath);
  } else if (target.exists) {
    validateOpenTarget(getRunDir(runId), target.absolutePath);
  }

  const result: OpenResult = {
    opened: false,
    target,
    dryRun: options.dryRun ?? false,
  };

  if (options.dryRun) {
    if (target.type === 'trace' && target.exists) {
      result.command = target.command;
    } else if (target.exists) {
      result.command = buildOpenCommand(target.absolutePath);
    }
    return result;
  }

  if (!target.exists) {
    return result;
  }

  if (target.type === 'trace') {
    result.command = target.command;
    if (options.launch) {
      // Safe execution: validate path is inside run dir, no shell interpolation
      const runDir = getRunDir(runId);
      validateOpenTarget(runDir, target.absolutePath);
      result.opened = true;
    }
    return result;
  }

  const openCmd = buildOpenCommand(target.absolutePath);
  if (openCmd) {
    result.command = openCmd;
  }

  result.opened = true;
  return result;
}
