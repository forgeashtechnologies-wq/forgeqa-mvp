import fs from 'node:fs';
import path from 'node:path';

export interface ForgeQAPaths {
  projectDir: string;
  projectConfigFile: string;
  artifactsDir: string;
  runsDir: string;
  comparisonsDir: string;
  userConfigFile: string;
  userStateDir: string;
  userCacheDir: string;
}

function getProjectRoot(): string {
  return process.cwd();
}

function getXdgConfigHome(): string {
  if (process.env.XDG_CONFIG_HOME) return process.env.XDG_CONFIG_HOME;
  if (process.env.HOME) return path.join(process.env.HOME, '.config');
  return path.join(getProjectRoot(), '.config');
}

function getXdgStateHome(): string {
  if (process.env.XDG_STATE_HOME) return process.env.XDG_STATE_HOME;
  if (process.env.HOME) return path.join(process.env.HOME, '.local', 'state');
  return path.join(getProjectRoot(), '.local', 'state');
}

function getXdgCacheHome(): string {
  if (process.env.XDG_CACHE_HOME) return process.env.XDG_CACHE_HOME;
  if (process.env.HOME) return path.join(process.env.HOME, '.cache');
  return path.join(getProjectRoot(), '.cache');
}

export function resolveForgeQAPaths(): ForgeQAPaths {
  const projectRoot = getProjectRoot();
  return {
    projectDir: path.join(projectRoot, '.forgeqa'),
    projectConfigFile: path.join(projectRoot, '.forgeqa', 'config.json'),
    artifactsDir: path.join(projectRoot, 'artifacts'),
    runsDir: path.join(projectRoot, 'artifacts', 'runs'),
    comparisonsDir: path.join(projectRoot, 'artifacts', 'comparisons'),
    userConfigFile: path.join(getXdgConfigHome(), 'forgeqa', 'config.json'),
    userStateDir: path.join(getXdgStateHome(), 'forgeqa'),
    userCacheDir: path.join(getXdgCacheHome(), 'forgeqa'),
  };
}

export function ensureProjectConfigDir(): void {
  const projectDir = path.join(getProjectRoot(), '.forgeqa');
  fs.mkdirSync(projectDir, { recursive: true });
}

export function ensureUserConfigDir(): void {
  const userConfigDir = path.join(getXdgConfigHome(), 'forgeqa');
  fs.mkdirSync(userConfigDir, { recursive: true });
}
