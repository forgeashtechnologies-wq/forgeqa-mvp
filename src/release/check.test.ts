import { describe, it, expect } from 'vitest';
import { runReleaseCheck, generateReleaseCheckMarkdown, generateReleaseCheckJson } from './check.js';

describe('Release Check', () => {
  it('default release-check works', async () => {
    const result = await runReleaseCheck();
    expect(result.status).toBeDefined();
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.summary.total).toBe(result.checks.length);
  });

  it('release-check --json parseable', async () => {
    const result = await runReleaseCheck();
    const json = generateReleaseCheckJson(result);
    const parsed = JSON.parse(json);
    expect(parsed.id).toBeDefined();
    expect(parsed.status).toBeDefined();
    expect(parsed.checks).toBeInstanceOf(Array);
  });

  it('release-check detects required scripts', async () => {
    const result = await runReleaseCheck();
    const lintCheck = result.checks.find((c) => c.id === 'script_lint');
    expect(lintCheck).toBeDefined();
    expect(lintCheck?.status).toBe('pass');
  });

  it('release-check validates template registry', async () => {
    const result = await runReleaseCheck();
    const templateCheck = result.checks.find((c) => c.id === 'templates_loadable');
    expect(templateCheck).toBeDefined();
    expect(templateCheck?.status).toBe('pass');
  });

  it('release-check validates industry registry', async () => {
    const result = await runReleaseCheck();
    const industryCheck = result.checks.find((c) => c.id === 'industry_registry');
    expect(industryCheck).toBeDefined();
    expect(industryCheck?.status).toBe('pass');
  });

  it('release-check detects no forbidden dependencies', async () => {
    const result = await runReleaseCheck();
    const depCheck = result.checks.find((c) => c.id === 'no_forbidden_deps');
    expect(depCheck).toBeDefined();
    expect(depCheck?.status).toBe('pass');
  });

  it('release-check markdown includes disclaimer', async () => {
    const result = await runReleaseCheck();
    const md = generateReleaseCheckMarkdown(result);
    expect(md).toContain('ForgeQA Local MVP Release Check');
    expect(md).toContain('Disclaimer');
    expect(md).toContain('not certify');
  });

  it('release-check with --include-browser checks browser readiness', async () => {
    const result = await runReleaseCheck({ includeBrowser: true });
    const browserCheck = result.checks.find((c) => c.id === 'browser_ready');
    expect(browserCheck).toBeDefined();
    expect(['pass', 'warn']).toContain(browserCheck?.status);
  });

  it('release-check writes expected structure', async () => {
    const result = await runReleaseCheck();
    expect(result.id).toMatch(/^release-check-/);
    expect(result.createdAt).toBeDefined();
    expect(result.version).toBeDefined();
    expect(result.caveats.length).toBeGreaterThan(0);
    expect(result.recommendedNextAction).toBeDefined();
  });
});
