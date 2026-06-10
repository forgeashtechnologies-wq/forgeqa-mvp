import { getRunShortId, readRunSummary, type RunSummary } from './history.js';

export interface RunComparison {
  runA: string;
  runB: string;
  shortA: string;
  shortB: string;
  differences: FieldDifference[];
  overallVerdict: 'unchanged' | 'changed' | 'improved' | 'worsened';
}

export interface FieldDifference {
  field: string;
  a: unknown;
  b: unknown;
  type: 'unchanged' | 'changed' | 'improved' | 'worsened';
}

function compareField(
  field: string,
  a: unknown,
  b: unknown,
  improveMap?: Record<string, string[]>,
  worsenMap?: Record<string, string[]>,
): FieldDifference {
  if (a === b) {
    return { field, a, b, type: 'unchanged' };
  }
  if (improveMap && improveMap[field]) {
    const better = improveMap[field];
    if (better.includes(String(b)) && !better.includes(String(a))) {
      return { field, a, b, type: 'improved' };
    }
    if (better.includes(String(a)) && !better.includes(String(b))) {
      return { field, a, b, type: 'worsened' };
    }
  }
  // Numeric fields where lower is better
  if (worsenMap && worsenMap[field]) {
    const numA = Number(a);
    const numB = Number(b);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      if (numB < numA) return { field, a, b, type: 'improved' };
      if (numB > numA) return { field, a, b, type: 'worsened' };
    }
  }
  return { field, a, b, type: 'changed' };
}

export function compareRuns(runIdA: string, runIdB: string, artifactsRoot?: string): RunComparison {
  const summaryA = readRunSummary(runIdA, artifactsRoot);
  const summaryB = readRunSummary(runIdB, artifactsRoot);

  if (!summaryA) {
    throw new Error(`Run not found: ${runIdA}`);
  }
  if (!summaryB) {
    throw new Error(`Run not found: ${runIdB}`);
  }

  const improveMap: Record<string, string[]> = {
    status: ['completed'],
    verdict: ['ready_for_demo'],
    reportHealth: ['pass'],
    fixtureValidationStatus: ['pass'],
    artifactIntegrityStatus: ['pass'],
  };

  const worsenMap: Record<string, string[]> = {
    blockedCount: ['lower_is_better'],
    cautionCount: ['lower_is_better'],
    stepFailCount: ['lower_is_better'],
    stepBlockedCount: ['lower_is_better'],
    validationFindings: ['lower_is_better'],
  };

  const diffs: FieldDifference[] = [];
  const fields: Array<keyof RunSummary> = [
    'templateId',
    'mode',
    'status',
    'verdict',
    'reportHealth',
    'dataSafetyStatus',
    'fixtureValidationStatus',
    'artifactIntegrityStatus',
    'blockedCount',
    'cautionCount',
    'allowedCount',
    'patternFindings',
    'domFindings',
    'policyFindings',
    'validationFindings',
    'stepPassCount',
    'stepFailCount',
    'stepSkippedCount',
    'stepBlockedCount',
    'durationMs',
    'screenshotCount',
    'traceZipPresent',
    'dataProfile',
    'generatedFileCount',
    'scopeCoveragePercent',
    'scopeTestedCount',
    'scopeNotTestedCount',
    'scopeNeedsHumanReviewCount',
    'failureAppBugCount',
    'failureTestBugCount',
    'failureEnvironmentIssueCount',
    'failurePolicyBlockCount',
    'failureExpectedDiagnosticCount',
  ];

  for (const field of fields) {
    diffs.push(compareField(field, summaryA[field], summaryB[field], improveMap, worsenMap));
  }

  const hasWorsened = diffs.some((d) => d.type === 'worsened');
  const hasImproved = diffs.some((d) => d.type === 'improved');
  const hasChanged = diffs.some((d) => d.type === 'changed');

  let overallVerdict: RunComparison['overallVerdict'] = 'unchanged';
  if (hasWorsened) overallVerdict = 'worsened';
  else if (hasImproved) overallVerdict = 'improved';
  else if (hasChanged) overallVerdict = 'changed';

  return {
    runA: runIdA,
    runB: runIdB,
    shortA: getRunShortId(runIdA),
    shortB: getRunShortId(runIdB),
    differences: diffs,
    overallVerdict,
  };
}

export function generateComparisonMarkdown(comparison: RunComparison): string {
  const lines: string[] = [];
  lines.push('# ForgeQA Run Comparison');
  lines.push('');
  lines.push(`| | Run A | Run B |`);
  lines.push(`|---|---|---|`);
  lines.push(`| **Run ID** | ${comparison.shortA} | ${comparison.shortB} |`);
  lines.push('');

  lines.push('## Differences');
  lines.push('');
  lines.push(`| Field | Run A | Run B | Change |`);
  lines.push(`|-------|-------|-------|--------|`);

  for (const diff of comparison.differences.filter((d) => d.type !== 'unchanged')) {
    const icon = diff.type === 'improved' ? '⬆️' : diff.type === 'worsened' ? '⬇️' : '↔️';
    lines.push(`| ${diff.field} | ${String(diff.a)} | ${String(diff.b)} | ${icon} ${diff.type} |`);
  }
  lines.push('');

  if (comparison.differences.filter((d) => d.type === 'unchanged').length > 0) {
    lines.push('## Unchanged');
    lines.push('');
    const unchanged = comparison.differences.filter((d) => d.type === 'unchanged').map((d) => d.field).join(', ');
    lines.push(unchanged);
    lines.push('');
  }

  lines.push(`**Overall:** ${comparison.overallVerdict}`);
  return lines.join('\n');
}

export function generateComparisonJson(comparison: RunComparison): string {
  return JSON.stringify({
    runA: comparison.runA,
    runB: comparison.runB,
    shortA: comparison.shortA,
    shortB: comparison.shortB,
    overallVerdict: comparison.overallVerdict,
    differences: comparison.differences,
  }, null, 2);
}
