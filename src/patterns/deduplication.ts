import type { PatternFinding } from './types.js';

function makeDedupKey(finding: PatternFinding): string {
  return `${finding.patternId}|${finding.evidence ?? finding.message}`;
}

export interface DedupedFinding extends PatternFinding {
  occurrenceCount: number;
  affectedStepIds: string[];
  firstDetectedStep?: string;
}

export function deduplicateFindings(findings: PatternFinding[]): DedupedFinding[] {
  const grouped = new Map<string, PatternFinding[]>();

  for (const f of findings) {
    const key = makeDedupKey(f);
    const list = grouped.get(key) ?? [];
    list.push(f);
    grouped.set(key, list);
  }

  const result: DedupedFinding[] = [];
  for (const [, group] of grouped) {
    if (group.length === 0) continue;

    // Pick the highest severity representative
    const severityOrder = { error: 3, warning: 2, info: 1 };
    const representative = group.reduce((best, current) => {
      const bestSev = severityOrder[best.severity] ?? 0;
      const curSev = severityOrder[current.severity] ?? 0;
      return curSev > bestSev ? current : best;
    });

    const affectedStepIds = Array.from(new Set(group.map((f) => f.stepId).filter((s): s is string => !!s)));

    result.push({
      ...representative,
      occurrenceCount: group.length,
      affectedStepIds,
      firstDetectedStep: affectedStepIds[0],
      evidence: representative.evidence ?? representative.message,
    });
  }

  // Sort by severity descending, then by occurrence count descending
  const severityOrder = { error: 0, warning: 1, info: 2 };
  result.sort((a, b) => {
    const sevDiff = (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
    if (sevDiff !== 0) return sevDiff;
    return b.occurrenceCount - a.occurrenceCount;
  });

  return result;
}

export function mergePatternAndDomFindings(
  patternFindings: PatternFinding[],
  domFindings: PatternFinding[],
): DedupedFinding[] {
  const combined = [...patternFindings, ...domFindings];
  return deduplicateFindings(combined);
}
