import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadForgeQAConfig,
  resolveForgeQAConfig,
  validateForgeQAConfig,
  writeProjectConfig,
  FORBIDDEN_CONFIG_KEYS,
} from './config.js';
import { ensureProjectConfigDir } from './paths.js';

describe('ForgeQA Config', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeqa-config-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns defaults when no config files exist', () => {
    const resolved = loadForgeQAConfig();
    expect(resolved.config.defaultViewport).toBe('desktop');
    expect(resolved.config.defaultMode).toBe('demo');
    expect(resolved.config.recentRunsLimit).toBe(20);
    expect(resolved.config.strictPolicyDefault).toBe(false);
  });

  it('CLI flags win over config defaults', () => {
    const resolved = resolveForgeQAConfig({ viewport: 'mobile', strictPolicy: true });
    expect(resolved.config.defaultViewport).toBe('mobile');
    expect(resolved.config.strictPolicyDefault).toBe(true);
  });

  it('validates safe config as valid', () => {
    const result = validateForgeQAConfig({ defaultViewport: 'mobile', recentRunsLimit: 10 });
    expect(result.valid).toBe(true);
  });

  it('rejects config with secrets', () => {
    for (const key of FORBIDDEN_CONFIG_KEYS) {
      const result = validateForgeQAConfig({ [key]: 'secret-value' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not allowed');
    }
  });

  it('config init creates safe config file', () => {
    const originalCwd = process.cwd();
    process.chdir(tempDir);
    try {
      ensureProjectConfigDir();
      const filePath = writeProjectConfig({ defaultViewport: 'desktop', defaultMode: 'demo', recentRunsLimit: 20 });
      expect(fs.existsSync(filePath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content.defaultViewport).toBe('desktop');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('config init refuses overwrite without force', () => {
    const originalCwd = process.cwd();
    process.chdir(tempDir);
    try {
      ensureProjectConfigDir();
      writeProjectConfig({ defaultViewport: 'desktop' });
      expect(() => writeProjectConfig({ defaultViewport: 'mobile' })).toThrow('already exists');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('config init overwrites with force', () => {
    const originalCwd = process.cwd();
    process.chdir(tempDir);
    try {
      ensureProjectConfigDir();
      writeProjectConfig({ defaultViewport: 'desktop' });
      const filePath = writeProjectConfig({ defaultViewport: 'mobile' }, true);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content.defaultViewport).toBe('mobile');
    } finally {
      process.chdir(originalCwd);
    }
  });
});
