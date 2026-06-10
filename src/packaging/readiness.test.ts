import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Packaging Readiness', () => {
  it('package.json has required fields', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
    expect(pkg.name).toBeDefined();
    expect(pkg.version).toBeDefined();
    expect(pkg.description).toBeDefined();
    expect(pkg.license).toBeDefined();
    expect(pkg.engines?.node).toBeDefined();
    expect(pkg.scripts).toBeDefined();
  });

  it('bin field points to CLI entry', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
    expect(pkg.bin?.forgeqa).toBeDefined();
  });

  it('required scripts exist', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
    const required = ['lint', 'test:unit', 'test:browser', 'test:run', 'test:ci', 'setup:browsers'];
    for (const script of required) {
      expect(pkg.scripts[script]).toBeDefined();
    }
  });

  it('README contains required sections', () => {
    const readme = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf-8');
    const requiredSections = ['Quick Start', 'Browser Setup', 'Scripts', 'Safety', 'License'];
    for (const section of requiredSections) {
      expect(readme).toContain(section);
    }
  });

  it('docs folder exists with required files', () => {
    const docsDir = path.join(process.cwd(), 'docs');
    expect(fs.existsSync(docsDir)).toBe(true);
    expect(fs.existsSync(path.join(docsDir, 'CLI_REFERENCE.md'))).toBe(true);
    expect(fs.existsSync(path.join(docsDir, 'ARTIFACTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(docsDir, 'SAFETY_MODEL.md'))).toBe(true);
    expect(fs.existsSync(path.join(docsDir, 'LOCAL_MVP_RELEASE.md'))).toBe(true);
    expect(fs.existsSync(path.join(docsDir, 'TROUBLESHOOTING.md'))).toBe(true);
  });

  it('safety docs contain no certification claims', () => {
    const safetyDoc = fs.readFileSync(path.join(process.cwd(), 'docs', 'SAFETY_MODEL.md'), 'utf-8');
    expect(safetyDoc).not.toContain('certifies');
    expect(safetyDoc).not.toContain('compliance certification');
    expect(safetyDoc).toContain('readiness-not-certification');
  });

  it('CI workflow or CI readiness doc exists', () => {
    const ciWorkflow = path.join(process.cwd(), '.github', 'workflows', 'ci.yml');
    const ciReadiness = path.join(process.cwd(), 'docs', 'CI_READINESS.md');
    expect(fs.existsSync(ciWorkflow) || fs.existsSync(ciReadiness)).toBe(true);
  });

  it('CLI entry has shebang', () => {
    const cli = fs.readFileSync(path.join(process.cwd(), 'src', 'cli.ts'), 'utf-8');
    expect(cli.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('LICENSE file exists matching package.json license', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
    expect(pkg.license).toBe('MIT');
    expect(fs.existsSync(path.join(process.cwd(), 'LICENSE'))).toBe(true);
    const licenseText = fs.readFileSync(path.join(process.cwd(), 'LICENSE'), 'utf-8');
    expect(licenseText).toContain('MIT License');
  });

  it('no forbidden backend dependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
    const forbidden = ['fastify', 'bull', 'redis', '@supabase/supabase-js', 'stripe', 'prisma', 'next', 'react', 'express'];
    const deps = Object.keys(pkg.dependencies ?? {});
    for (const dep of forbidden) {
      expect(deps).not.toContain(dep);
    }
  });
});
