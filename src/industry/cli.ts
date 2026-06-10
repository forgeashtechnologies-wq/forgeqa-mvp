import { Command } from 'commander';
import { listIndustryPacks, getIndustryPackById, recommendIndustryPacks } from './registry.js';
import { validateAllIndustryPacks } from './validator.js';
import { assessRunAgainstIndustryPack, assessScanAgainstIndustryPack, generateIndustryAssessmentMarkdown, generateIndustryAssessmentJson } from './assessor.js';
import { assessBatchById, generateBatchIndustryAssessmentMarkdown, generateBatchIndustryAssessmentJson } from './batch-assessor.js';
import type { IndustryPackAssessment } from './types.js';

const industryCmd = new Command('industry')
  .description('List and assess industry-specific readiness packs');

industryCmd
  .command('list')
  .description('List all available industry packs')
  .option('--json', 'Output JSON', false)
  .action((options: { json: boolean }) => {
    const packs = listIndustryPacks();
    if (options.json) {
      console.log(JSON.stringify({ packs: packs.map((p) => ({ id: p.id, name: p.name, version: p.version, appCategory: p.appCategory, riskLevel: p.riskLevel })) }, null, 2));
    } else {
      console.log('Industry Packs');
      console.log('');
      for (const p of packs) {
        console.log(`  ${p.id} — ${p.name} (${p.version}) [${p.riskLevel}]`);
        console.log(`    ${p.description}`);
        console.log('');
      }
    }
  });

industryCmd
  .command('show <packId>')
  .description('Show details of an industry pack')
  .option('--json', 'Output JSON', false)
  .action((packId: string, options: { json: boolean }) => {
    const pack = getIndustryPackById(packId);
    if (!pack) {
      console.error(`Error: Industry pack "${packId}" not found.`);
      process.exit(1);
    }
    if (options.json) {
      console.log(JSON.stringify(pack, null, 2));
    } else {
      console.log(`Industry Pack: ${pack.name}`);
      console.log(`  ID:        ${pack.id}`);
      console.log(`  Version:   ${pack.version}`);
      console.log(`  Category:  ${pack.appCategory}`);
      console.log(`  Risk:      ${pack.riskLevel}`);
      console.log(`  Users:     ${pack.targetUsers.join(', ')}`);
      console.log(`  Description: ${pack.description}`);
      console.log('');
      console.log('Recommended Templates:');
      for (const t of pack.recommendedTemplates) {
        console.log(`  [${t.priority}] ${t.templateId} — ${t.reason}`);
      }
      console.log('');
      console.log('Not-Tested Warnings:');
      for (const w of pack.notTestedWarnings) {
        console.log(`  - ${w}`);
      }
      console.log('');
      console.log('Caveats:');
      for (const c of pack.caveats) {
        console.log(`  - ${c}`);
      }
    }
  });

industryCmd
  .command('recommend')
  .description('Recommend industry packs based on scan or run context')
  .option('--scan <scanId>', 'Use scan result for recommendation')
  .option('--run <runId>', 'Use run result for recommendation')
  .option('--json', 'Output JSON', false)
  .action((options: { scan?: string; run?: string; json: boolean }) => {
    // For now, recommend based on generic context; can be enriched with actual scan/run data
    const recs = recommendIndustryPacks();
    if (options.json) {
      console.log(JSON.stringify({ recommendations: recs }, null, 2));
    } else {
      console.log('Recommended Industry Packs');
      console.log('');
      for (const r of recs) {
        console.log(`  ${r.packId} — ${r.packName}`);
        console.log(`    Confidence: ${Math.round(r.confidence * 100)}%`);
        console.log(`    Reason: ${r.reason}`);
        if (r.matchedIndicators.length > 0) {
          console.log(`    Matched: ${r.matchedIndicators.join(', ')}`);
        }
        console.log('');
      }
    }
  });

industryCmd
  .command('assess')
  .description('Assess a run, scan, or batch against an industry pack')
  .requiredOption('--pack <packId>', 'Industry pack ID')
  .option('--run <runId>', 'Run ID to assess')
  .option('--scan <scanId>', 'Scan ID to assess')
  .option('--batch <batchId>', 'Batch ID to assess')
  .option('--json', 'Output JSON', false)
  .action(async (options: { pack: string; run?: string; scan?: string; batch?: string; json: boolean }) => {
    const pack = getIndustryPackById(options.pack);
    if (!pack) {
      console.error(`Error: Industry pack "${options.pack}" not found.`);
      process.exit(1);
    }

    if (options.batch) {
      const batchAssessment = assessBatchById(options.batch, options.pack);
      if (!batchAssessment) {
        console.error(`Error: Could not assess batch "${options.batch}".`);
        process.exit(1);
      }
      if (options.json) {
        console.log(generateBatchIndustryAssessmentJson(batchAssessment));
      } else {
        console.log(generateBatchIndustryAssessmentMarkdown(batchAssessment));
      }
      return;
    }

    let assessment: IndustryPackAssessment | null = null;

    if (options.run) {
      assessment = assessRunAgainstIndustryPack(options.run, options.pack);
    } else if (options.scan) {
      // Load scan result from artifacts
      const scanPath = `artifacts/scans/${options.scan}/scan-result.json`;
      try {
        const scanData = JSON.parse(require('node:fs').readFileSync(scanPath, 'utf-8'));
        assessment = assessScanAgainstIndustryPack(scanData, options.pack);
      } catch {
        console.error(`Error: Could not load scan result at ${scanPath}`);
        process.exit(1);
      }
    } else {
      console.error('Error: Provide --run <runId>, --scan <scanId>, or --batch <batchId>');
      process.exit(1);
    }

    if (!assessment) {
      console.error('Error: Assessment could not be generated.');
      process.exit(1);
    }

    if (options.json) {
      console.log(generateIndustryAssessmentJson(assessment));
    } else {
      console.log(generateIndustryAssessmentMarkdown(assessment));
    }
  });

industryCmd
  .command('validate')
  .description('Validate all built-in industry packs')
  .option('--json', 'Output JSON', false)
  .action((options: { json: boolean }) => {
    const { valid, results } = validateAllIndustryPacks(listIndustryPacks());
    if (options.json) {
      console.log(JSON.stringify({ valid, results }, null, 2));
    } else {
      console.log(`Industry Pack Validation: ${valid ? 'PASS' : 'FAIL'}`);
      console.log('');
      for (const r of results) {
        console.log(`  ${r.packId}: ${r.valid ? 'OK' : 'INVALID'}`);
        for (const e of r.errors) {
          console.log(`    ERROR: ${e}`);
        }
        for (const w of r.warnings) {
          console.log(`    WARN: ${w}`);
        }
      }
    }
    if (!valid) process.exit(1);
  });

export default industryCmd;
