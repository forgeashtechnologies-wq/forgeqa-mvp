import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveOpenTarget,
  validateOpenTarget,
  getPlatformOpenCommand,
  buildOpenCommand,
  openRunArtifact,
} from './open.js';

describe('Open Run Artifact', () => {
  let runDir: string;
  const runId = 'open_test_run_001';

  beforeEach(() => {
    runDir = path.join(process.cwd(), 'artifacts', 'runs', runId);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'report.html'), '<html></html>', 'utf-8');
    fs.writeFileSync(path.join(runDir, 'report.md'), '# Report', 'utf-8');
    fs.writeFileSync(path.join(runDir, 'trace.zip'), 'fake', 'utf-8');
  });

  afterEach(() => {
    fs.rmSync(runDir, { recursive: true, force: true });
  });

  it('open defaults to report.html when present', () => {
    const result = resolveOpenTarget(runId, {});
    expect(result.type).toBe('html');
    expect(result.relativePath).toBe('report.html');
    expect(result.exists).toBe(true);
  });

  it('open --markdown resolves report.md', () => {
    const result = resolveOpenTarget(runId, { markdown: true });
    expect(result.type).toBe('markdown');
    expect(result.relativePath).toBe('report.md');
  });

  it('open --trace returns local trace command guidance', () => {
    const result = resolveOpenTarget(runId, { trace: true });
    expect(result.type).toBe('trace');
    expect(result.command).toContain('show-trace');
  });

  it('open --folder resolves run folder', () => {
    const result = resolveOpenTarget(runId, { folder: true });
    expect(result.type).toBe('folder');
    expect(result.relativePath).toBe('.');
  });

  it('validateOpenTarget rejects paths outside run dir', () => {
    expect(() => validateOpenTarget(runDir, '/etc/passwd')).toThrow('outside run directory');
  });

  it('validateOpenTarget rejects URL targets', () => {
    expect(() => validateOpenTarget(runDir, 'https://example.com')).toThrow('URL targets');
  });

  it('getPlatformOpenCommand returns a command for current platform', () => {
    const cmd = getPlatformOpenCommand();
    expect(typeof cmd).toBe('string');
    expect(['open', 'start', 'xdg-open']).toContain(cmd);
  });

  it('buildOpenCommand rejects unsafe paths', () => {
    expect(() => buildOpenCommand('/path;rm -rf /')).toThrow('unsafe characters');
  });

  it('openRunArtifact --dry-run does not open anything', () => {
    const result = openRunArtifact(runId, { dryRun: true });
    expect(result.opened).toBe(false);
    expect(result.dryRun).toBe(true);
  });

  it('openRunArtifact returns valid result for existing artifact', () => {
    const result = openRunArtifact(runId, {});
    expect(result.target.exists).toBe(true);
    expect(result.target.type).toBe('html');
  });

  it('openRunArtifact --trace --launch validates path inside run dir', () => {
    const result = openRunArtifact(runId, { trace: true, launch: true });
    expect(result.target.exists).toBe(true);
    expect(result.target.type).toBe('trace');
    expect(result.opened).toBe(true);
  });

  it('openRunArtifact --trace --dry-run returns show-trace command', () => {
    const result = openRunArtifact(runId, { trace: true, dryRun: true });
    expect(result.command).toContain('show-trace');
    expect(result.dryRun).toBe(true);
  });

  it('openRunArtifact --trace --json returns trace target', () => {
    const result = openRunArtifact(runId, { trace: true, json: true });
    expect(result.target.type).toBe('trace');
    expect(result.target.exists).toBe(true);
  });
});
