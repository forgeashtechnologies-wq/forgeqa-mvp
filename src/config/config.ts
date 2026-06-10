import fs from 'node:fs';
import { z } from 'zod';
import { resolveForgeQAPaths, ensureProjectConfigDir } from './paths.js';

const ForgeQAConfigSchema = z.object({
  defaultViewport: z.enum(['desktop', 'mobile', 'tablet', 'small-mobile']).optional(),
  defaultMode: z.enum(['demo', 'external']).optional(),
  artifactsDir: z.string().optional(),
  reportOpenCommand: z.string().optional(),
  jsonOutputDefault: z.boolean().optional(),
  recentRunsLimit: z.number().int().min(1).max(100).optional(),
  strictPolicyDefault: z.boolean().optional(),
}).strict();

export type ForgeQAConfig = z.infer<typeof ForgeQAConfigSchema>;

const DEFAULT_CONFIG: ForgeQAConfig = {
  defaultViewport: 'desktop',
  defaultMode: 'demo',
  artifactsDir: 'artifacts/runs',
  recentRunsLimit: 20,
  strictPolicyDefault: false,
  jsonOutputDefault: false,
};

export const FORBIDDEN_CONFIG_KEYS = ['baseUrl', 'approveRisk', 'password', 'secret', 'token', 'apiKey', 'credentials'];

function validateNoSecrets(config: unknown): { valid: boolean; error?: string } {
  if (typeof config !== 'object' || config === null) return { valid: true };
  const obj = config as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_CONFIG_KEYS.some((fk) => lower.includes(fk.toLowerCase()))) {
      return { valid: false, error: `Config key "${key}" is not allowed in ForgeQA config for security reasons.` };
    }
  }
  return { valid: true };
}

function loadConfigFile(filePath: string): ForgeQAConfig | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const secretCheck = validateNoSecrets(raw);
    if (!secretCheck.valid) {
      throw new Error(secretCheck.error);
    }
    const parsed = ForgeQAConfigSchema.parse(raw);
    return parsed;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(`Invalid config at ${filePath}: ${err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
    }
    throw err;
  }
}

export interface ResolvedConfig {
  config: ForgeQAConfig;
  sources: ConfigSource[];
}

export interface ConfigSource {
  name: string;
  path: string;
  present: boolean;
  keys: string[];
}

export function loadForgeQAConfig(): ResolvedConfig {
  const paths = resolveForgeQAPaths();
  const sources: ConfigSource[] = [];

  // 1. User-level config
  let userConfig: ForgeQAConfig | undefined;
  try {
    userConfig = loadConfigFile(paths.userConfigFile);
  } catch (err) {
    // Ignore invalid user config — project config wins anyway
  }
  sources.push({
    name: 'user',
    path: paths.userConfigFile,
    present: !!userConfig,
    keys: userConfig ? Object.keys(userConfig) : [],
  });

  // 2. Project-local config
  let projectConfig: ForgeQAConfig | undefined;
  try {
    projectConfig = loadConfigFile(paths.projectConfigFile);
  } catch (err) {
    // Ignore invalid project config
  }
  sources.push({
    name: 'project',
    path: paths.projectConfigFile,
    present: !!projectConfig,
    keys: projectConfig ? Object.keys(projectConfig) : [],
  });

  // Merge order: defaults -> user -> project
  const config: ForgeQAConfig = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    ...projectConfig,
  };

  return { config, sources };
}

export interface CliOverrides {
  viewport?: string;
  mode?: 'demo' | 'external';
  strictPolicy?: boolean;
  artifactsDir?: string;
}

export function resolveForgeQAConfig(cliOverrides?: CliOverrides): ResolvedConfig {
  const resolved = loadForgeQAConfig();

  if (cliOverrides) {
    if (cliOverrides.viewport) resolved.config.defaultViewport = cliOverrides.viewport as ForgeQAConfig['defaultViewport'];
    if (cliOverrides.mode) resolved.config.defaultMode = cliOverrides.mode;
    if (cliOverrides.strictPolicy !== undefined) resolved.config.strictPolicyDefault = cliOverrides.strictPolicy;
    if (cliOverrides.artifactsDir) resolved.config.artifactsDir = cliOverrides.artifactsDir;
  }

  return resolved;
}

export function validateForgeQAConfig(config: unknown): { valid: boolean; error?: string } {
  const secretCheck = validateNoSecrets(config);
  if (!secretCheck.valid) return secretCheck;

  const parsed = ForgeQAConfigSchema.safeParse(config);
  if (!parsed.success) {
    return { valid: false, error: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ') };
  }
  return { valid: true };
}

export function getConfigSourceSummary(): { projectExists: boolean; userExists: boolean } {
  const paths = resolveForgeQAPaths();
  return {
    projectExists: fs.existsSync(paths.projectConfigFile),
    userExists: fs.existsSync(paths.userConfigFile),
  };
}

export function writeProjectConfig(config: ForgeQAConfig, force = false): string {
  const paths = resolveForgeQAPaths();
  if (fs.existsSync(paths.projectConfigFile) && !force) {
    throw new Error(`Project config already exists at ${paths.projectConfigFile}. Use --force to overwrite.`);
  }
  ensureProjectConfigDir();
  const safeConfig: ForgeQAConfig = {};
  for (const key of Object.keys(config) as Array<keyof ForgeQAConfig>) {
    if (config[key] !== undefined) {
      (safeConfig as Record<string, unknown>)[key] = config[key];
    }
  }
  fs.writeFileSync(paths.projectConfigFile, JSON.stringify(safeConfig, null, 2) + '\n', 'utf-8');
  return paths.projectConfigFile;
}
