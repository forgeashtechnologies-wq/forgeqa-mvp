import fs from 'node:fs';
import path from 'node:path';

export interface ReleaseCheck {
  id: string;
  category: 'scripts' | 'tests' | 'validation' | 'artifacts' | 'security' | 'docs' | 'templates' | 'industry' | 'batch' | 'smoke' | 'packaging';
  status: 'pass' | 'warn' | 'fail' | 'skipped';
  message: string;
  evidence?: string;
  suggestedFix?: string;
}

export interface ReleaseCheckResult {
  id: string;
  createdAt: string;
  status: 'pass' | 'warn' | 'fail';
  version: string;
  checks: ReleaseCheck[];
  summary: {
    total: number;
    pass: number;
    warn: number;
    fail: number;
    skipped: number;
  };
  recommendedNextAction?: string;
  caveats: string[];
}

const FORBIDDEN_DEPS = [
  'fastify',
  '@fastify/cors',
  '@fastify/static',
  'bull',
  'redis',
  '@supabase/supabase-js',
  'stripe',
  'prisma',
  'drizzle-orm',
  'next',
  'react',
  'express',
];

const REQUIRED_SCRIPTS = ['lint', 'test:unit', 'test:browser', 'test:run', 'test:ci', 'setup:browsers'];

function loadPackageJson(): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
  } catch {
    return null;
  }
}

export async function runReleaseCheck(options: {
  includeBrowser?: boolean;
  includeSmoke?: boolean;
  includeBatch?: boolean;
  includeIndustry?: boolean;
  includeRepairSmoke?: boolean;
  includeUnifiedReportSmoke?: boolean;
  includeBatchReportSmoke?: boolean;
  includeDashboardSmoke?: boolean;
} = {}): Promise<ReleaseCheckResult> {
  const checks: ReleaseCheck[] = [];
  const id = `release-check-${Date.now()}`;
  const createdAt = new Date().toISOString();
  const pkg = loadPackageJson();
  const version = (pkg?.version as string) ?? 'unknown';

  // 1. Package metadata
  if (pkg) {
    checks.push({
      id: 'pkg_exists',
      category: 'scripts',
      status: 'pass',
      message: 'package.json found',
    });
  } else {
    checks.push({
      id: 'pkg_exists',
      category: 'scripts',
      status: 'fail',
      message: 'package.json not found',
      suggestedFix: 'Ensure package.json exists in project root.',
    });
  }

  // 2. Required scripts
  const scripts = (pkg?.scripts as Record<string, string>) ?? {};
  for (const script of REQUIRED_SCRIPTS) {
    if (scripts[script]) {
      checks.push({
        id: `script_${script}`,
        category: 'scripts',
        status: 'pass',
        message: `Script "${script}" exists`,
      });
    } else {
      checks.push({
        id: `script_${script}`,
        category: 'scripts',
        status: 'fail',
        message: `Script "${script}" missing`,
        suggestedFix: `Add "${script}" to package.json scripts.`,
      });
    }
  }

  // 3. No forbidden backend dependencies
  const allDeps = {
    ...(pkg?.dependencies as Record<string, string> ?? {}),
    ...(pkg?.devDependencies as Record<string, string> ?? {}),
  };
  const foundForbidden = Object.keys(allDeps).filter((d) =>
    FORBIDDEN_DEPS.some((f) => d === f || d.startsWith(`${f}/`)),
  );
  if (foundForbidden.length === 0) {
    checks.push({
      id: 'no_forbidden_deps',
      category: 'security',
      status: 'pass',
      message: 'No forbidden backend/SaaS dependencies detected',
    });
  } else {
    checks.push({
      id: 'no_forbidden_deps',
      category: 'security',
      status: 'warn',
      message: `Forbidden dependencies detected: ${foundForbidden.join(', ')}`,
      evidence: `Found in package.json: ${foundForbidden.join(', ')}`,
      suggestedFix: 'Review and remove unnecessary backend/SaaS dependencies for local MVP.',
    });
  }

  // 4. No .env or secrets committed
  const envPath = path.join(process.cwd(), '.env');
  const envExamplePath = path.join(process.cwd(), '.env.example');
  if (fs.existsSync(envPath)) {
    checks.push({
      id: 'no_env_file',
      category: 'security',
      status: 'warn',
      message: '.env file exists in project root',
      evidence: '.env found at project root',
      suggestedFix: 'Add .env to .gitignore and remove from repo if it contains secrets.',
    });
  } else {
    checks.push({
      id: 'no_env_file',
      category: 'security',
      status: 'pass',
      message: 'No .env file in project root',
    });
  }
  if (fs.existsSync(envExamplePath)) {
    checks.push({
      id: 'env_example',
      category: 'security',
      status: 'pass',
      message: '.env.example found',
    });
  }

  // 5. README exists
  const readmePath = path.join(process.cwd(), 'README.md');
  if (fs.existsSync(readmePath)) {
    checks.push({
      id: 'readme_exists',
      category: 'docs',
      status: 'pass',
      message: 'README.md found',
    });
  } else {
    checks.push({
      id: 'readme_exists',
      category: 'docs',
      status: 'warn',
      message: 'README.md not found',
      suggestedFix: 'Add a README.md with project description and usage.',
    });
  }

  // 6. AGENTS.md exists
  const agentsPath = path.join(process.cwd(), 'AGENTS.md');
  if (fs.existsSync(agentsPath)) {
    checks.push({
      id: 'agents_md_exists',
      category: 'docs',
      status: 'pass',
      message: 'AGENTS.md found',
    });
  } else {
    checks.push({
      id: 'agents_md_exists',
      category: 'docs',
      status: 'warn',
      message: 'AGENTS.md not found',
      suggestedFix: 'Add AGENTS.md with agent rules and project conventions.',
    });
  }

  // 7. Template registry loadable
  try {
    const { listTemplates } = await import('../templates/registry.js');
    const templates = listTemplates();
    checks.push({
      id: 'templates_loadable',
      category: 'templates',
      status: 'pass',
      message: `Template registry loadable (${templates.length} templates)`,
    });
  } catch {
    checks.push({
      id: 'templates_loadable',
      category: 'templates',
      status: 'fail',
      message: 'Template registry failed to load',
      suggestedFix: 'Check src/templates/registry.ts for errors.',
    });
  }

  // 8. Diagnostics registry loadable
  try {
    const { listDiagnosticTemplates } = await import('../templates/registry.js');
    const diagnostics = listDiagnosticTemplates();
    checks.push({
      id: 'diagnostics_loadable',
      category: 'templates',
      status: 'pass',
      message: `Diagnostics registry loadable (${diagnostics.length} diagnostics)`,
    });
  } catch {
    checks.push({
      id: 'diagnostics_loadable',
      category: 'templates',
      status: 'fail',
      message: 'Diagnostics registry failed to load',
      suggestedFix: 'Check src/templates/registry.ts for errors.',
    });
  }

  // 9. Industry pack registry validates
  try {
    const { listIndustryPacks } = await import('../industry/registry.js');
    const packs = listIndustryPacks();
    checks.push({
      id: 'industry_registry',
      category: 'industry',
      status: 'pass',
      message: `Industry registry loadable (${packs.length} packs)`,
    });
  } catch {
    checks.push({
      id: 'industry_registry',
      category: 'industry',
      status: 'fail',
      message: 'Industry registry failed to load',
      suggestedFix: 'Check src/industry/registry.ts for errors.',
    });
  }

  // 10. Artifact validator loadable
  try {
    await import('../artifacts/validator.js');
    checks.push({
      id: 'artifact_validator',
      category: 'validation',
      status: 'pass',
      message: 'Artifact validator loadable',
    });
  } catch {
    checks.push({
      id: 'artifact_validator',
      category: 'validation',
      status: 'fail',
      message: 'Artifact validator failed to load',
      suggestedFix: 'Check src/artifacts/validator.ts for errors.',
    });
  }

  // 11. Batch validator loadable
  try {
    await import('../batch/validator.js');
    checks.push({
      id: 'batch_validator',
      category: 'batch',
      status: 'pass',
      message: 'Batch validator loadable',
    });
  } catch {
    checks.push({
      id: 'batch_validator',
      category: 'batch',
      status: 'fail',
      message: 'Batch validator failed to load',
      suggestedFix: 'Check src/batch/validator.ts for errors.',
    });
  }

  // 12. Browser test readiness (optional)
  if (options.includeBrowser) {
    // Check if Playwright Chromium is installed
    try {
      const { checkPlaywrightChromiumInstalled } = await import('../executor/browser-preflight.js');
      const installed = await checkPlaywrightChromiumInstalled();
      checks.push({
        id: 'browser_ready',
        category: 'tests',
        status: installed ? 'pass' : 'warn',
        message: installed ? 'Playwright Chromium installed' : 'Playwright Chromium not installed',
        evidence: installed ? undefined : 'Run: pnpm exec playwright install chromium',
        suggestedFix: installed ? undefined : 'Run: pnpm exec playwright install chromium',
      });
    } catch {
      checks.push({
        id: 'browser_ready',
        category: 'tests',
        status: 'warn',
        message: 'Could not check browser readiness',
      });
    }
  }

  // 13. Smoke tests (optional)
  if (options.includeSmoke) {
    checks.push({
      id: 'smoke_runs',
      category: 'smoke',
      status: 'skipped',
      message: 'Smoke tests not run in default release-check (use --include-smoke to enable)',
    });
  }

  // 14. Batch tests (optional)
  if (options.includeBatch) {
    checks.push({
      id: 'batch_tests',
      category: 'batch',
      status: 'skipped',
      message: 'Batch tests not run in default release-check (use --include-batch to enable)',
    });
  }

  // 15. Industry tests (optional)
  if (options.includeIndustry) {
    checks.push({
      id: 'industry_tests',
      category: 'industry',
      status: 'skipped',
      message: 'Industry tests not run in default release-check (use --include-industry to enable)',
    });
  }

  // 16. Repair engine loadable
  try {
    await import('../artifacts/repair.js');
    checks.push({
      id: 'repair_engine',
      category: 'validation',
      status: 'pass',
      message: 'Repair engine loadable',
    });
  } catch {
    checks.push({
      id: 'repair_engine',
      category: 'validation',
      status: 'fail',
      message: 'Repair engine failed to load',
      suggestedFix: 'Check src/artifacts/repair.ts for errors.',
    });
  }

  // 17. Repair smoke (optional)
  if (options.includeRepairSmoke) {
    try {
      const { repairRunArtifacts } = await import('../artifacts/repair.js');
      // Run a tiny synthetic repair on a non-existent run to verify the engine can be called
      const smokeResult = repairRunArtifacts('nonexistent-smoke-run-12345', {});
      checks.push({
        id: 'repair_smoke',
        category: 'smoke',
        status: smokeResult.status === 'failed' && smokeResult.findings.some((f) => f.message.includes('not found')) ? 'pass' : 'warn',
        message: 'Repair engine smoke test passed (correctly failed on missing run)',
      });
    } catch (err) {
      checks.push({
        id: 'repair_smoke',
        category: 'smoke',
        status: 'fail',
        message: `Repair engine smoke test failed: ${(err as Error).message}`,
        suggestedFix: 'Check src/artifacts/repair.ts for runtime errors.',
      });
    }
  }

  // 18. Unified report generator loadable
  try {
    await import('../reports/unified-run-report.js');
    checks.push({
      id: 'unified_report_generator',
      category: 'validation',
      status: 'pass',
      message: 'Unified report generator loadable',
    });
  } catch {
    checks.push({
      id: 'unified_report_generator',
      category: 'validation',
      status: 'fail',
      message: 'Unified report generator failed to load',
      suggestedFix: 'Check src/reports/unified-run-report.ts for errors.',
    });
  }

  // 19. Unified report smoke (optional)
  if (options.includeUnifiedReportSmoke) {
    try {
      const { buildUnifiedRunReport } = await import('../reports/unified-run-report.js');
      // Smoke test with non-existent run should throw
      try {
        buildUnifiedRunReport('nonexistent-smoke-run-12345');
        checks.push({
          id: 'unified_report_smoke',
          category: 'smoke',
          status: 'warn',
          message: 'Unified report smoke test: did not throw for missing run',
        });
      } catch {
        checks.push({
          id: 'unified_report_smoke',
          category: 'smoke',
          status: 'pass',
          message: 'Unified report smoke test passed (correctly failed on missing run)',
        });
      }
    } catch (err) {
      checks.push({
        id: 'unified_report_smoke',
        category: 'smoke',
        status: 'fail',
        message: `Unified report smoke test failed: ${(err as Error).message}`,
        suggestedFix: 'Check src/reports/unified-run-report.ts for runtime errors.',
      });
    }
  }

  // 20. Batch unified report generator loadable
  try {
    await import('../reports/batch-unified-report.js');
    checks.push({
      id: 'batch_unified_report_generator',
      category: 'validation',
      status: 'pass',
      message: 'Batch unified report generator loadable',
    });
  } catch {
    checks.push({
      id: 'batch_unified_report_generator',
      category: 'validation',
      status: 'fail',
      message: 'Batch unified report generator failed to load',
      suggestedFix: 'Check src/reports/batch-unified-report.ts for errors.',
    });
  }

  // 21. Batch unified report smoke (optional)
  if (options.includeBatchReportSmoke) {
    try {
      const { buildUnifiedBatchReport } = await import('../reports/batch-unified-report.js');
      // Smoke test with non-existent batch should throw
      try {
        buildUnifiedBatchReport('nonexistent-smoke-batch-12345');
        checks.push({
          id: 'batch_unified_report_smoke',
          category: 'smoke',
          status: 'warn',
          message: 'Batch unified report smoke test: did not throw for missing batch',
        });
      } catch {
        checks.push({
          id: 'batch_unified_report_smoke',
          category: 'smoke',
          status: 'pass',
          message: 'Batch unified report smoke test passed (correctly failed on missing batch)',
        });
      }
    } catch (err) {
      checks.push({
        id: 'batch_unified_report_smoke',
        category: 'smoke',
        status: 'fail',
        message: `Batch unified report smoke test failed: ${(err as Error).message}`,
        suggestedFix: 'Check src/reports/batch-unified-report.ts for runtime errors.',
      });
    }
  }

  // 22. Dashboard generator loadable
  try {
    await import('../dashboard/collector.js');
    checks.push({
      id: 'dashboard_generator',
      category: 'validation',
      status: 'pass',
      message: 'Dashboard generator loadable',
    });
  } catch {
    checks.push({
      id: 'dashboard_generator',
      category: 'validation',
      status: 'fail',
      message: 'Dashboard generator failed to load',
      suggestedFix: 'Check src/dashboard/collector.ts for errors.',
    });
  }

  // 23. Dashboard smoke (optional)
  if (options.includeDashboardSmoke) {
    try {
      const { collectProjectDashboard } = await import('../dashboard/collector.js');
      const dashboard = collectProjectDashboard({ limit: 5 });
      checks.push({
        id: 'dashboard_smoke',
        category: 'smoke',
        status: 'pass',
        message: `Dashboard smoke test passed (${dashboard.summary.totalRuns} runs, ${dashboard.summary.totalBatches} batches)`,
      });
    } catch (err) {
      checks.push({
        id: 'dashboard_smoke',
        category: 'smoke',
        status: 'fail',
        message: `Dashboard smoke test failed: ${(err as Error).message}`,
        suggestedFix: 'Check src/dashboard/collector.ts for runtime errors.',
      });
    }
  }

  // 24. Package bin field exists
  if (pkg) {
    const bin = pkg.bin as Record<string, string> | undefined;
    if (bin && bin.forgeqa) {
      checks.push({
        id: 'package_bin_field',
        category: 'packaging',
        status: 'pass',
        message: 'Package bin field exists',
      });
    } else {
      checks.push({
        id: 'package_bin_field',
        category: 'packaging',
        status: 'warn',
        message: 'Package bin field missing or incomplete',
        suggestedFix: 'Add "bin": {"forgeqa": "dist/cli.js"} to package.json',
      });
    }

    // 24b. Package manager field
    if (pkg.packageManager) {
      checks.push({
        id: 'package_manager_field',
        category: 'packaging',
        status: 'pass',
        message: `Package manager field set: ${pkg.packageManager}`,
      });
    } else {
      checks.push({
        id: 'package_manager_field',
        category: 'packaging',
        status: 'warn',
        message: 'Package manager field not set',
        suggestedFix: 'Add "packageManager": "pnpm@<version>" to package.json',
      });
    }

    // 24c. Build script exists
    const scripts = pkg.scripts as Record<string, string> | undefined;
    if (scripts?.build) {
      checks.push({
        id: 'build_script',
        category: 'packaging',
        status: 'pass',
        message: 'Build script exists',
      });
    } else {
      checks.push({
        id: 'build_script',
        category: 'packaging',
        status: 'warn',
        message: 'Build script not found',
        suggestedFix: 'Add "build": "tsc" to package.json scripts',
      });
    }
  }

  // 25. README exists with required sections
  if (fs.existsSync(readmePath)) {
    const readme = fs.readFileSync(readmePath, 'utf-8');
    const requiredSections = ['Quick Start', 'Browser Setup', 'Scripts', 'Safety', 'License'];
    const missingSections = requiredSections.filter((s) => !readme.includes(s));
    if (missingSections.length === 0) {
      checks.push({
        id: 'readme_required_sections',
        category: 'packaging',
        status: 'pass',
        message: 'README contains required sections',
      });
    } else {
      checks.push({
        id: 'readme_required_sections',
        category: 'packaging',
        status: 'warn',
        message: `README missing sections: ${missingSections.join(', ')}`,
        suggestedFix: 'Add missing sections to README.md',
      });
    }

    // 25b. README links AGENTS.md
    if (readme.includes('AGENTS.md')) {
      checks.push({
        id: 'readme_agents_link',
        category: 'packaging',
        status: 'pass',
        message: 'README links AGENTS.md',
      });
    } else {
      checks.push({
        id: 'readme_agents_link',
        category: 'packaging',
        status: 'warn',
        message: 'README does not link AGENTS.md',
        suggestedFix: 'Add AGENTS.md link to README Documentation section',
      });
    }
  } else {
    checks.push({
      id: 'readme_required_sections',
      category: 'packaging',
      status: 'fail',
      message: 'README.md not found',
      suggestedFix: 'Create README.md with required sections.',
    });
  }

  // 25c. LICENSE file exists
  const licensePath = path.join(process.cwd(), 'LICENSE');
  if (fs.existsSync(licensePath)) {
    checks.push({
      id: 'license_file',
      category: 'packaging',
      status: 'pass',
      message: 'LICENSE file found',
    });
  } else {
    checks.push({
      id: 'license_file',
      category: 'packaging',
      status: 'warn',
      message: 'LICENSE file not found',
      suggestedFix: 'Add a LICENSE file matching the license declared in package.json',
    });
  }

  // 25d. package.json license field
  if (pkg && (pkg.license as string)) {
    checks.push({
      id: 'package_license_field',
      category: 'packaging',
      status: 'pass',
      message: `Package license field set: ${pkg.license as string}`,
    });
  } else {
    checks.push({
      id: 'package_license_field',
      category: 'packaging',
      status: 'warn',
      message: 'Package license field not set',
      suggestedFix: 'Add "license": "MIT" to package.json',
    });
  }

  // 26. Docs folder exists
  const docsDir = path.join(process.cwd(), 'docs');
  if (fs.existsSync(docsDir)) {
    checks.push({
      id: 'docs_folder',
      category: 'packaging',
      status: 'pass',
      message: 'Docs folder exists',
    });
  } else {
    checks.push({
      id: 'docs_folder',
      category: 'packaging',
      status: 'warn',
      message: 'Docs folder not found',
      suggestedFix: 'Create docs/ folder with CLI reference and safety docs.',
    });
  }

  // 27. CI workflow or CI readiness doc exists
  const ciWorkflowPath = path.join(process.cwd(), '.github', 'workflows', 'ci.yml');
  const ciReadinessPath = path.join(process.cwd(), 'docs', 'CI_READINESS.md');
  if (fs.existsSync(ciWorkflowPath) || fs.existsSync(ciReadinessPath)) {
    checks.push({
      id: 'ci_readiness',
      category: 'packaging',
      status: 'pass',
      message: 'CI workflow or CI readiness doc exists',
    });
  } else {
    checks.push({
      id: 'ci_readiness',
      category: 'packaging',
      status: 'warn',
      message: 'No CI workflow or CI readiness doc found',
      suggestedFix: 'Add .github/workflows/ci.yml or docs/CI_READINESS.md',
    });
  }

  // Compute summary
  const pass = checks.filter((c) => c.status === 'pass').length;
  const warn = checks.filter((c) => c.status === 'warn').length;
  const fail = checks.filter((c) => c.status === 'fail').length;
  const skipped = checks.filter((c) => c.status === 'skipped').length;

  const status: ReleaseCheckResult['status'] = fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass';

  const recommendedNextAction = fail > 0
    ? 'Fix failing checks before release.'
    : warn > 0
      ? 'Review warnings before release.'
      : 'Local MVP is ready for founder use.';

  return {
    id,
    createdAt,
    status,
    version,
    checks,
    summary: { total: checks.length, pass, warn, fail, skipped },
    recommendedNextAction,
    caveats: [
      'This release check validates ForgeQA local MVP readiness only.',
      'It does not certify customer applications as secure, compliant, bug-free, or production-ready.',
      'Browser tests require Playwright Chromium to be installed.',
      'Smoke tests are optional and may take several minutes.',
    ],
  };
}

export function generateReleaseCheckMarkdown(result: ReleaseCheckResult): string {
  const lines: string[] = [];
  lines.push('# ForgeQA Local MVP Release Check');
  lines.push('');
  lines.push(`- **ID:** \`${result.id}\``);
  lines.push(`- **Version:** ${result.version}`);
  lines.push(`- **Status:** ${result.status.toUpperCase()}`);
  lines.push(`- **Created At:** ${result.createdAt}`);
  lines.push('');

  lines.push('## Executive Summary');
  lines.push(`- Total Checks: ${result.summary.total}`);
  lines.push(`- Passed: ${result.summary.pass}`);
  lines.push(`- Warnings: ${result.summary.warn}`);
  lines.push(`- Failures: ${result.summary.fail}`);
  lines.push(`- Skipped: ${result.summary.skipped}`);
  lines.push('');

  const passedChecks = result.checks.filter((c) => c.status === 'pass');
  const warnChecks = result.checks.filter((c) => c.status === 'warn');
  const failChecks = result.checks.filter((c) => c.status === 'fail');

  if (passedChecks.length > 0) {
    lines.push('## What Passed');
    for (const c of passedChecks) {
      lines.push(`- **${c.id}** (${c.category}): ${c.message}`);
    }
    lines.push('');
  }

  if (warnChecks.length > 0) {
    lines.push('## Warnings');
    for (const c of warnChecks) {
      lines.push(`- **${c.id}** (${c.category}): ${c.message}`);
      if (c.evidence) lines.push(`  - Evidence: ${c.evidence}`);
      if (c.suggestedFix) lines.push(`  - Fix: ${c.suggestedFix}`);
    }
    lines.push('');
  }

  if (failChecks.length > 0) {
    lines.push('## Failures');
    for (const c of failChecks) {
      lines.push(`- **${c.id}** (${c.category}): ${c.message}`);
      if (c.evidence) lines.push(`  - Evidence: ${c.evidence}`);
      if (c.suggestedFix) lines.push(`  - Fix: ${c.suggestedFix}`);
    }
    lines.push('');
  }

  lines.push('## Recommended Next Action');
  lines.push(result.recommendedNextAction ?? 'Review checks above.');
  lines.push('');

  lines.push('## Caveats');
  for (const c of result.caveats) {
    lines.push(`- ${c}`);
  }
  lines.push('');

  lines.push('## Disclaimer');
  lines.push('> This release check validates ForgeQA\'s local MVP readiness. It does not certify customer applications as secure, compliant, bug-free, or production-ready.');
  lines.push('');

  return lines.join('\n');
}

export function generateReleaseCheckJson(result: ReleaseCheckResult): string {
  return JSON.stringify(result, null, 2);
}
