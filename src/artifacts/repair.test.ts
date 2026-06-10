import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { repairRunArtifacts, generateRepairMarkdown, writeRunRepairArtifacts } from './repair.js';

describe('Run Artifact Repair', () => {
  let runDir: string;
  let runId: string;

  beforeEach(() => {
    const runsDir = path.join(process.cwd(), 'artifacts', 'runs');
    fs.mkdirSync(runsDir, { recursive: true });
    runId = `test-repair-${Date.now()}`;
    runDir = path.join(runsDir, runId);
    fs.mkdirSync(runDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(runDir)) {
      fs.rmSync(runDir, { recursive: true, force: true });
    }
  });

  it('converts absolute path inside run folder to relative path', () => {
    const absPath = path.join(process.cwd(), 'artifacts', 'runs', runId, 'screenshots', 'test.png');
    fs.mkdirSync(path.join(runDir, 'screenshots'), { recursive: true });
    fs.writeFileSync(path.join(runDir, 'report.md'), `# Report\nSee ${absPath}\n`, 'utf-8');

    const result = repairRunArtifacts(runId);
    const absAction = result.actions.find((a) => a.id === 'abs_path_report.md');
    expect(absAction).toBeDefined();
    expect(absAction?.status).toBe('fixed');

    const content = fs.readFileSync(path.join(runDir, 'report.md'), 'utf-8');
    expect(content).not.toContain(process.cwd());
    expect(content).toContain('./screenshots/test.png');
  });

  it('does not rewrite absolute path outside run folder; marks manual_review', () => {
    fs.writeFileSync(path.join(runDir, 'report.md'), `# Report\nSee /Users/other/report.md\n`, 'utf-8');

    const result = repairRunArtifacts(runId);
    const absAction = result.actions.find((a) => a.id === 'abs_path_report.md');
    expect(absAction).toBeUndefined(); // No fix action because we don't auto-fix unknown paths

    const content = fs.readFileSync(path.join(runDir, 'report.md'), 'utf-8');
    expect(content).toContain('/Users/other/report.md');
  });

  it('removes/converts safe file:// reference inside run folder', () => {
    const fileUrl = `file://${path.join(process.cwd(), 'artifacts', 'runs', runId, 'screenshots', 'test.png')}`;
    fs.mkdirSync(path.join(runDir, 'screenshots'), { recursive: true });
    fs.writeFileSync(path.join(runDir, 'report.md'), `# Report\nSee ${fileUrl}\n`, 'utf-8');

    const result = repairRunArtifacts(runId);
    const fileAction = result.actions.find((a) => a.id === 'file_url_report.md');
    expect(fileAction).toBeDefined();
    expect(fileAction?.status).toBe('fixed');

    const content = fs.readFileSync(path.join(runDir, 'report.md'), 'utf-8');
    expect(content).not.toContain('file://');
  });

  it('adds disclaimer to markdown when missing', () => {
    fs.writeFileSync(path.join(runDir, 'report.md'), '# Report\n', 'utf-8');

    const result = repairRunArtifacts(runId);
    const discAction = result.actions.find((a) => a.id === 'disclaimer_report.md');
    expect(discAction).toBeDefined();
    expect(discAction?.status).toBe('fixed');

    const content = fs.readFileSync(path.join(runDir, 'report.md'), 'utf-8');
    expect(content).toContain('does not certify');
  });

  it('adds disclaimer to HTML when missing', () => {
    fs.writeFileSync(path.join(runDir, 'report.html'), '<html><body><p>Report</p></body></html>', 'utf-8');

    const result = repairRunArtifacts(runId);
    const discAction = result.actions.find((a) => a.id === 'disclaimer_report.html');
    expect(discAction).toBeDefined();
    expect(discAction?.status).toBe('fixed');

    const content = fs.readFileSync(path.join(runDir, 'report.html'), 'utf-8');
    expect(content).toContain('does not certify');
  });

  it('creates run-validation alias when missing', () => {
    fs.writeFileSync(path.join(runDir, 'artifact-validation.json'), JSON.stringify({ isValid: true, checks: [], findings: [] }), 'utf-8');
    fs.writeFileSync(path.join(runDir, 'artifact-validation.md'), '# Validation\n', 'utf-8');

    const result = repairRunArtifacts(runId);
    const aliasAction = result.actions.find((a) => a.id === 'alias_copy_run-validation.json');
    expect(aliasAction).toBeDefined();
    expect(aliasAction?.status).toBe('fixed');

    expect(fs.existsSync(path.join(runDir, 'run-validation.json'))).toBe(true);
    expect(fs.existsSync(path.join(runDir, 'run-validation.md'))).toBe(true);
  });

  it('skips alias overwrite without force-fix', () => {
    fs.writeFileSync(path.join(runDir, 'artifact-validation.json'), '{}', 'utf-8');
    fs.writeFileSync(path.join(runDir, 'artifact-validation.md'), '# Validation\n', 'utf-8');
    fs.writeFileSync(path.join(runDir, 'run-validation.json'), '{}', 'utf-8');
    fs.writeFileSync(path.join(runDir, 'run-validation.md'), '# Existing\n', 'utf-8');

    const result = repairRunArtifacts(runId);
    const aliasAction = result.actions.find((a) => a.id === 'alias_skip_run-validation.json');
    expect(aliasAction).toBeDefined();
    expect(aliasAction?.status).toBe('skipped');
  });

  it('writes artifact-repair.json/md and run-repair aliases', () => {
    fs.writeFileSync(path.join(runDir, 'report.md'), '# Report\n', 'utf-8');

    const result = repairRunArtifacts(runId);
    writeRunRepairArtifacts(result);

    expect(fs.existsSync(path.join(runDir, 'artifact-repair.json'))).toBe(true);
    expect(fs.existsSync(path.join(runDir, 'artifact-repair.md'))).toBe(true);
    expect(fs.existsSync(path.join(runDir, 'run-repair.json'))).toBe(true);
    expect(fs.existsSync(path.join(runDir, 'run-repair.md'))).toBe(true);
  });

  it('generates valid repair markdown', () => {
    fs.writeFileSync(path.join(runDir, 'report.md'), '# Report\n', 'utf-8');
    const result = repairRunArtifacts(runId);
    const md = generateRepairMarkdown(result);
    expect(md).toContain('# Repair Report');
    expect(md).toContain(runId);
    expect(md).toContain('Disclaimer');
  });

  it('does not modify source files', () => {
    const sourceFile = path.join(process.cwd(), 'src', 'artifacts', 'repair.ts');
    const beforeStat = fs.statSync(sourceFile);

    fs.writeFileSync(path.join(runDir, 'report.md'), '# Report\n', 'utf-8');
    repairRunArtifacts(runId);

    const afterStat = fs.statSync(sourceFile);
    expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
  });
});
