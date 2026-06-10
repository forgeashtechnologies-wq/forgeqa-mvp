import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  validateFixtureFile,
  validateFixtureRoutes,
  validateAllFixtures,
  detectExternalFixtureAssets,
  detectMissingRequiredSelectors,
  detectProductionUrls,
  detectRealEmailDomains,
  detectSecretValues,
} from './validator.js';
import { listTemplates, listDiagnosticTemplates } from '../templates/registry.js';
import { ROUTE_MAP } from '../demo/server.js';

function createTempFixture(html: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeqa-fixture-'));
  const file = path.join(dir, 'fixture.html');
  fs.writeFileSync(file, html, 'utf-8');
  return file;
}

describe('Fixture Validator', () => {
  it('detects external script', () => {
    const html = '<script src="https://cdn.example.com/lib.js"></script>';
    const result = detectExternalFixtureAssets(html);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('script');
  });

  it('allows localhost scripts', () => {
    const html = '<script src="http://localhost:3000/app.js"></script>';
    const result = detectExternalFixtureAssets(html);
    expect(result).toHaveLength(0);
  });

  it('detects missing selectors', () => {
    const html = '<div data-testid="found"></div>';
    const missing = detectMissingRequiredSelectors(html, ['[data-testid="found"]', '[data-testid="missing"]']);
    expect(missing).toEqual(['[data-testid="missing"]']);
  });

  it('detects production URLs', () => {
    const html = '<a href="https://forgeqa.com/about">link</a>';
    const urls = detectProductionUrls(html);
    expect(urls.length).toBeGreaterThan(0);
  });

  it('detects real email domains', () => {
    const html = '<span>test@gmail.com</span>';
    const emails = detectRealEmailDomains(html);
    expect(emails).toContain('test@gmail.com');
  });

  it('allows safe test domains', () => {
    const html = '<span>test@forgeqa.test</span>';
    const emails = detectRealEmailDomains(html);
    expect(emails).toHaveLength(0);
  });

  it('detects secret values', () => {
    const html = 'const apiKey = "sk-1234567890abcdef"';
    const secrets = detectSecretValues(html);
    expect(secrets.length).toBeGreaterThan(0);
  });

  it('validates fixture file with pass', () => {
    const html = '<!DOCTYPE html><html><body><div data-testid="safe-box">ok</div></body></html>';
    const file = createTempFixture(html);
    const result = validateFixtureFile(file, ['[data-testid="safe-box"]']);
    expect(result.status).toBe('pass');
  });

  it('fails on missing selector', () => {
    const html = '<!DOCTYPE html><html><body></body></html>';
    const file = createTempFixture(html);
    const result = validateFixtureFile(file, ['[data-testid="missing"]']);
    expect(result.status).toBe('fail');
    expect(result.findings.some((f) => f.patternId === 'fixture_missing_required_selector')).toBe(true);
  });

  it('allows diagnostic missing selector when declared', () => {
    const html = '<!DOCTYPE html><html><body></body></html>';
    const file = createTempFixture(html);
    const result = validateFixtureFile(file, ['[data-testid="missing"]'], {
      expectedMissingSelectors: true,
      fixtureValidationMode: 'diagnostic',
    });
    expect(result.status).toBe('pass');
  });

  it('validates fixture routes', () => {
    const routeMap: Record<string, string> = { '/test': 'test.html' };
    const result = validateFixtureRoutes(routeMap, os.tmpdir());
    expect(result.status).toBe('fail');
    expect(result.findings.some((f) => f.patternId === 'fixture_route_missing_file')).toBe(true);
  });

  it('detects external image', () => {
    const html = '<img src="https://cdn.example.com/pic.png">';
    const result = detectExternalFixtureAssets(html);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('image');
  });

  it('detects missing fixture file', () => {
    const result = validateFixtureFile('/nonexistent/path.html', ['[data-testid="x"]']);
    expect(result.status).toBe('fail');
    expect(result.findings.some((f) => f.patternId === 'fixture_file_missing')).toBe(true);
  });

  it('validates all templates against demo routes', () => {
    const templates = [...listTemplates(), ...listDiagnosticTemplates()];
    const result = validateAllFixtures(templates, ROUTE_MAP);
    expect(result.status).toBe('pass');
  });
});
