import fs from 'node:fs';
import path from 'node:path';

export function writeJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function writeJsonError(error: Error | string, exitCode = 1): void {
  const message = typeof error === 'string' ? error : error.message;
  const output = {
    error: message,
    exitCode,
  };
  console.error(JSON.stringify(output, null, 2));
}

export function assertNoDecorativeOutputWhenJson(commandName: string, output: string): string {
  const decorativePatterns = [
    /[\u{1F600}-\u{1F64F}]/u, // emojis
    /[\u{1F300}-\u{1F5FF}]/u,
    /[\u{1F680}-\u{1F6FF}]/u,
    /[\u{2600}-\u{26FF}]/u,
    /[\u{2700}-\u{27BF}]/u,
  ];
  for (const pattern of decorativePatterns) {
    if (pattern.test(output)) {
      throw new Error(`JSON output for ${commandName} contains decorative characters (emoji/spinner). This breaks machine-readable contracts.`);
    }
  }
  return output;
}

export function ensureParseableJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch (err) {
    throw new Error(`Expected valid JSON but got parse error: ${(err as Error).message}. Output was: ${stdout.slice(0, 200)}`);
  }
}

export function validateJsonCommandOutput(_commandName: string, stdout: string, requiredTopLevelFields: string[] = []): { valid: boolean; parsed: unknown; missingFields: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { valid: false, parsed: undefined, missingFields: [] };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { valid: false, parsed, missingFields: [] };
  }

  const obj = parsed as Record<string, unknown>;
  const missingFields = requiredTopLevelFields.filter((f) => !(f in obj));

  return { valid: missingFields.length === 0, parsed, missingFields };
}

export function writeComparisonMarkdown(comparison: { runA: string; runB: string; markdown: string }): string {
  const comparisonsDir = path.join(process.cwd(), 'artifacts', 'comparisons');
  fs.mkdirSync(comparisonsDir, { recursive: true });
  const fileName = `${comparison.runA}_vs_${comparison.runB}.md`;
  const filePath = path.join(comparisonsDir, fileName);
  fs.writeFileSync(filePath, comparison.markdown, 'utf-8');
  return filePath;
}
