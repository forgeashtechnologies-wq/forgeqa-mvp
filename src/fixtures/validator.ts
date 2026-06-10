import fs from 'node:fs';
import path from 'node:path';
import type { PatternFinding } from '../patterns/types.js';
import { enrichFinding } from '../patterns/analyzer.js';
import type { WorkflowTemplate } from '../templates/types.js';

export interface FixtureCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail' | 'info';
  message: string;
  route?: string;
  fixturePath?: string;
}

export interface FixtureValidationResult {
  status: 'pass' | 'warn' | 'fail' | 'not_applicable';
  checks: FixtureCheck[];
  findings: PatternFinding[];
  route?: string;
  fixturePath?: string;
}

export interface FixtureRouteMap {
  [route: string]: string; // route -> relative fixture path
}

const FIXTURES_ROOT = path.resolve(process.cwd(), 'fixtures', 'demo-target');
const PRODUCTION_DOMAINS = [
  'forgeqa.com', 'forgeqa.io', 'example.com',
  'gmail.com', 'yahoo.com', 'outlook.com',
  'stripe.com', 'paypal.com',
  'facebook.com', 'google.com', 'microsoft.com',
];
const SECRET_PATTERNS = [
  /api[_-]?key\s*[:=]\s*["']\w+/i,
  /password\s*[:=]\s*["']\w+/i,
  /secret\s*[:=]\s*["']\w+/i,
  /token\s*[:=]\s*["']\w+/i,
  /private[_-]?key\s*[:=]/i,
  /service[_-]?role\s*[:=]/i,
];

function isExternalAsset(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase().trim();
  if (lower.startsWith('http://') && lower.includes('localhost')) return false;
  if (lower.startsWith('http://') && lower.includes('127.0.0.1')) return false;
  if (lower.startsWith('https://') || lower.startsWith('http://')) return true;
  if (lower.startsWith('//')) return true;
  return false;
}

export function detectExternalFixtureAssets(html: string): Array<{ type: string; src: string }> {
  const findings: Array<{ type: string; src: string }> = [];
  const scriptMatches = html.match(/<script[^>]+src=["']([^"']+)["']/gi) || [];
  for (const m of scriptMatches) {
    const src = m.match(/src=["']([^"']+)["']/)?.[1] ?? '';
    if (isExternalAsset(src)) {
      findings.push({ type: 'script', src });
    }
  }
  const linkMatches = html.match(/<link[^>]+href=["']([^"']+)["']/gi) || [];
  for (const m of linkMatches) {
    const href = m.match(/href=["']([^"']+)["']/)?.[1] ?? '';
    if (isExternalAsset(href)) {
      findings.push({ type: 'stylesheet', src: href });
    }
  }
  const imgMatches = html.match(/<img[^>]+src=["']([^"']+)["']/gi) || [];
  for (const m of imgMatches) {
    const src = m.match(/src=["']([^"']+)["']/)?.[1] ?? '';
    if (isExternalAsset(src)) {
      findings.push({ type: 'image', src });
    }
  }
  const iframeMatches = html.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || [];
  for (const m of iframeMatches) {
    const src = m.match(/src=["']([^"']+)["']/)?.[1] ?? '';
    if (isExternalAsset(src)) {
      findings.push({ type: 'iframe', src });
    }
  }
  const objectMatches = html.match(/<object[^>]+data=["']([^"']+)["']/gi) || [];
  for (const m of objectMatches) {
    const data = m.match(/data=["']([^"']+)["']/)?.[1] ?? '';
    if (isExternalAsset(data)) {
      findings.push({ type: 'object', src: data });
    }
  }
  const embedMatches = html.match(/<embed[^>]+src=["']([^"']+)["']/gi) || [];
  for (const m of embedMatches) {
    const src = m.match(/src=["']([^"']+)["']/)?.[1] ?? '';
    if (isExternalAsset(src)) {
      findings.push({ type: 'embed', src });
    }
  }
  return findings;
}

export function detectMissingRequiredSelectors(html: string, selectors: string[]): string[] {
  const missing: string[] = [];
  for (const sel of selectors) {
    const testId = sel.replace(/\[data-testid="(.+)"\]/, '$1');
    if (testId === sel) {
      // Not a data-testid selector, skip exact check
      if (!html.includes(testId)) {
        missing.push(sel);
      }
      continue;
    }
    // Check for data-testid="..." pattern
    const pattern = new RegExp(`data-testid=["']${testId}["']`);
    if (!pattern.test(html)) {
      missing.push(sel);
    }
  }
  return missing;
}

export function detectProductionUrls(html: string): string[] {
  const found: string[] = [];
  const urlMatches = html.match(/https?:\/\/[^\s"'`<>]+/g) || [];
  for (const url of urlMatches) {
    for (const domain of PRODUCTION_DOMAINS) {
      if (url.toLowerCase().includes(domain)) {
        found.push(url);
        break;
      }
    }
  }
  return found;
}

export function detectRealEmailDomains(html: string): string[] {
  const found: string[] = [];
  const emailMatches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  for (const email of emailMatches) {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) continue;
    // Safe test domains are allowed
    if (domain.includes('forgeqa.test') || domain.includes('example.test') || domain.includes('forgecircle.test')) {
      continue;
    }
    found.push(email);
  }
  return found;
}

export function detectSecretValues(html: string): string[] {
  const found: string[] = [];
  for (const pattern of SECRET_PATTERNS) {
    const matches = html.match(pattern);
    if (matches) {
      found.push(...matches);
    }
  }
  return found;
}

export function validateFixtureFile(
  fixturePath: string,
  requiredSelectors: string[],
  options: {
    expectedMissingSelectors?: boolean;
    fixtureValidationMode?: 'strict' | 'diagnostic' | 'none';
    route?: string;
  } = {},
): FixtureValidationResult {
  const checks: FixtureCheck[] = [];
  const findings: PatternFinding[] = [];

  if (options.fixtureValidationMode === 'none') {
    return {
      status: 'not_applicable',
      checks: [{ name: 'fixture validation mode', status: 'info', message: 'Fixture validation disabled for this template' }],
      findings: [],
      route: options.route,
      fixturePath,
    };
  }

  const isDiagnostic = options.fixtureValidationMode === 'diagnostic';

  // File exists
  if (!fs.existsSync(fixturePath)) {
    checks.push({ name: 'fixture file exists', status: 'fail', message: `Fixture file not found: ${fixturePath}`, route: options.route, fixturePath });
    findings.push(enrichFinding({
      patternId: 'fixture_file_missing',
      message: `Fixture file missing for route ${options.route ?? 'unknown'}`,
      severity: 'error',
      evidence: `fixturePath=${fixturePath}`,
    }));
    return { status: 'fail', checks, findings, route: options.route, fixturePath };
  }

  checks.push({ name: 'fixture file exists', status: 'pass', message: 'Fixture file found', route: options.route, fixturePath });

  const html = fs.readFileSync(fixturePath, 'utf-8');
  const fileSize = fs.statSync(fixturePath).size;

  // File size reasonable
  if (fileSize > 1024 * 1024) {
    checks.push({ name: 'fixture file size', status: 'warn', message: `Fixture file is large (${(fileSize / 1024).toFixed(1)} KB)`, route: options.route, fixturePath });
  } else {
    checks.push({ name: 'fixture file size', status: 'pass', message: `Fixture file size is reasonable (${fileSize} bytes)`, route: options.route, fixturePath });
  }

  // External assets
  const externalAssets = detectExternalFixtureAssets(html);
  if (externalAssets.length > 0) {
    checks.push({ name: 'no external assets', status: 'fail', message: `Found ${externalAssets.length} external asset(s): ${externalAssets.map((a) => `${a.type}=${a.src}`).join(', ')}`, route: options.route, fixturePath });
    for (const asset of externalAssets) {
      findings.push(enrichFinding({
        patternId: 'fixture_contains_external_asset',
        message: `Fixture contains external ${asset.type}: ${asset.src}`,
        severity: 'warning',
        evidence: `fixturePath=${fixturePath}, assetType=${asset.type}, src=${asset.src}`,
      }));
    }
  } else {
    checks.push({ name: 'no external assets', status: 'pass', message: 'No external assets found', route: options.route, fixturePath });
  }

  // Required selectors
  const missingSelectors = detectMissingRequiredSelectors(html, requiredSelectors);
  if (missingSelectors.length > 0) {
    if (isDiagnostic && options.expectedMissingSelectors) {
      checks.push({ name: 'required selectors present', status: 'info', message: `Missing selectors (expected for diagnostic): ${missingSelectors.join(', ')}`, route: options.route, fixturePath });
    } else {
      checks.push({ name: 'required selectors present', status: 'fail', message: `Missing required selectors: ${missingSelectors.join(', ')}`, route: options.route, fixturePath });
      findings.push(enrichFinding({
        patternId: 'fixture_missing_required_selector',
        message: `Fixture missing required selectors: ${missingSelectors.join(', ')}`,
        severity: 'error',
        evidence: `fixturePath=${fixturePath}, missing=${missingSelectors.join(',')}`,
      }));
    }
  } else {
    checks.push({ name: 'required selectors present', status: 'pass', message: 'All required selectors found', route: options.route, fixturePath });
  }

  // Production URLs
  const prodUrls = detectProductionUrls(html);
  if (prodUrls.length > 0) {
    checks.push({ name: 'no production URLs', status: 'warn', message: `Found production-looking URLs: ${prodUrls.join(', ')}`, route: options.route, fixturePath });
    for (const url of prodUrls) {
      findings.push(enrichFinding({
        patternId: 'fixture_contains_production_url',
        message: `Fixture contains production URL: ${url}`,
        severity: 'warning',
        evidence: `fixturePath=${fixturePath}, url=${url}`,
      }));
    }
  } else {
    checks.push({ name: 'no production URLs', status: 'pass', message: 'No production URLs found', route: options.route, fixturePath });
  }

  // Real email domains
  const realEmails = detectRealEmailDomains(html);
  if (realEmails.length > 0) {
    checks.push({ name: 'no real email domains', status: 'warn', message: `Found real email domains: ${realEmails.join(', ')}`, route: options.route, fixturePath });
    findings.push(enrichFinding({
      patternId: 'fixture_contains_real_email',
      message: `Fixture contains real email address: ${realEmails.join(', ')}`,
      severity: 'warning',
      evidence: `fixturePath=${fixturePath}`,
    }));
  } else {
    checks.push({ name: 'no real email domains', status: 'pass', message: 'No real email domains found', route: options.route, fixturePath });
  }

  // Secret values
  const secrets = detectSecretValues(html);
  if (secrets.length > 0) {
    checks.push({ name: 'no secret values', status: 'fail', message: `Found potential secrets: ${secrets.join(', ')}`, route: options.route, fixturePath });
    findings.push(enrichFinding({
      patternId: 'fixture_contains_secret_value',
      message: `Fixture may contain secret value`,
      severity: 'error',
      evidence: `fixturePath=${fixturePath}`,
    }));
  } else {
    checks.push({ name: 'no secret values', status: 'pass', message: 'No secret values found', route: options.route, fixturePath });
  }

  // Determine overall status
  let status: 'pass' | 'warn' | 'fail' = 'pass';
  const hasFail = checks.some((c) => c.status === 'fail');
  const hasWarn = checks.some((c) => c.status === 'warn');
  if (hasFail) status = 'fail';
  else if (hasWarn) status = 'warn';

  return { status, checks, findings, route: options.route, fixturePath };
}

export function validateFixtureRoutes(routeMap: FixtureRouteMap, fixtureRoot: string = FIXTURES_ROOT): FixtureValidationResult {
  const checks: FixtureCheck[] = [];
  const findings: PatternFinding[] = [];

  let hasFail = false;

  for (const [route, relativePath] of Object.entries(routeMap)) {
    const fixturePath = path.join(fixtureRoot, relativePath);
    if (!fs.existsSync(fixturePath)) {
      checks.push({ name: `route ${route}`, status: 'fail', message: `Route ${route} maps to missing fixture: ${relativePath}`, route, fixturePath: relativePath });
      findings.push(enrichFinding({
        patternId: 'fixture_route_missing_file',
        message: `Route ${route} has no corresponding fixture file`,
        severity: 'error',
        evidence: `route=${route}, relativePath=${relativePath}`,
      }));
      hasFail = true;
    } else {
      checks.push({ name: `route ${route}`, status: 'pass', message: `Route ${route} -> ${relativePath}`, route, fixturePath: relativePath });
    }
  }

  return {
    status: hasFail ? 'fail' : 'pass',
    checks,
    findings,
  };
}

export function validateAllFixtures(
  templates: readonly WorkflowTemplate[],
  routeMap: FixtureRouteMap,
  fixtureRoot: string = FIXTURES_ROOT,
): FixtureValidationResult {
  const checks: FixtureCheck[] = [];
  const findings: PatternFinding[] = [];

  // First validate routes
  const routeResult = validateFixtureRoutes(routeMap, fixtureRoot);
  checks.push(...routeResult.checks);
  findings.push(...routeResult.findings);

  if (routeResult.status === 'fail') {
    return { status: 'fail', checks, findings };
  }

  // Validate each template's fixture
  let overallStatus: 'pass' | 'warn' | 'fail' = 'pass';

  for (const template of templates) {
    if (!template.fixtureRoute && template.demoRoutes.length > 0) {
      // Derive from first demo route
      const route = template.demoRoutes[0];
      const relativePath = routeMap[route];
      if (!relativePath) continue;

      const fixturePath = path.join(fixtureRoot, relativePath);
      const requiredSelectors = template.requiredFixtureTestIds ?? [];
      const result = validateFixtureFile(fixturePath, requiredSelectors, {
        expectedMissingSelectors: template.expectedMissingSelectors,
        fixtureValidationMode: template.fixtureValidationMode ?? 'strict',
        route,
      });

      checks.push(...result.checks);
      findings.push(...result.findings);

      if (result.status === 'fail') overallStatus = 'fail';
      else if (result.status === 'warn' && overallStatus !== 'fail') overallStatus = 'warn';
    }
  }

  return { status: overallStatus, checks, findings };
}

export interface FixtureValidationReport {
  status: 'pass' | 'warn' | 'fail' | 'not_applicable';
  checkedRoute?: string;
  checkedFixtureFile?: string;
  missingSelectors: string[];
  externalAssetFindings: Array<{ type: string; src: string }>;
  productionUrlFindings: string[];
  secretFindings: string[];
  realEmailFindings: string[];
  routeRegistered: boolean;
  diagnosticException?: boolean;
  checks: FixtureCheck[];
  findings: PatternFinding[];
}

export function generateFixtureValidationReport(result: FixtureValidationResult): FixtureValidationReport {
  return {
    status: result.status,
    checkedRoute: result.route,
    checkedFixtureFile: result.fixturePath,
    missingSelectors: result.checks
      .filter((c) => c.name === 'required selectors present' && (c.status === 'fail' || c.status === 'info'))
      .flatMap((c) => {
        const match = c.message.match(/Missing(?: required)? selectors[^:]*: (.*)/);
        return match ? match[1].split(',').map((s) => s.trim()) : [];
      }),
    externalAssetFindings: result.checks
      .filter((c) => c.name === 'no external assets' && c.status === 'fail')
      .flatMap((c) => {
        const matches = c.message.matchAll(/(\w+)=([^,\s]+)/g);
        return Array.from(matches).map((m) => ({ type: m[1], src: m[2] }));
      }),
    productionUrlFindings: result.findings
      .filter((f) => f.patternId === 'fixture_contains_production_url')
      .map((f) => f.evidence?.split(', url=')[1] ?? f.message),
    secretFindings: result.findings
      .filter((f) => f.patternId === 'fixture_contains_secret_value')
      .map((f) => f.message),
    realEmailFindings: result.findings
      .filter((f) => f.patternId === 'fixture_contains_real_email')
      .map((f) => f.message),
    routeRegistered: !result.findings.some((f) => f.patternId === 'fixture_route_missing_file'),
    diagnosticException: result.checks.some((c) => c.name === 'required selectors present' && c.status === 'info' && c.message.includes('diagnostic')),
    checks: result.checks,
    findings: result.findings,
  };
}

export function generateFixtureValidationMarkdown(result: FixtureValidationResult): string {
  const lines: string[] = [];
  lines.push('# Fixture Validation Report');
  lines.push('');
  lines.push(`**Overall Status:** ${result.status}`);
  if (result.route) lines.push(`**Route:** ${result.route}`);
  if (result.fixturePath) lines.push(`**Fixture Path:** ${result.fixturePath}`);
  lines.push('');

  lines.push('## Checks');
  lines.push('');
  for (const check of result.checks) {
    const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : check.status === 'info' ? 'ℹ️' : '❌';
    lines.push(`- ${icon} **${check.name}**: ${check.message}`);
  }
  lines.push('');

  if (result.findings.length > 0) {
    lines.push('## Findings');
    lines.push('');
    for (const f of result.findings) {
      lines.push(`- **${f.patternId}** (${f.severity}): ${f.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
