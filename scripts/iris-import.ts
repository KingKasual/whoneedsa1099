/**
 * Import an official IRIS CSV template (downloaded from the IRIS Taxpayer Portal) as config.
 * Usage: npm run iris:import -- path/to/template.csv 1099-NEC
 * Only the header row is read. No code changes needed to swap templates.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import Papa from 'papaparse';
import { templateFromHeaders, type IrisTemplate } from '../src/export/iris';

const [file, form] = process.argv.slice(2);
if (!file || (form !== '1099-NEC' && form !== '1099-MISC')) {
  console.error('Usage: npm run iris:import -- <template.csv> <1099-NEC|1099-MISC>');
  process.exit(2);
}
const target = `src/export/iris-templates/${form}.ty2026.json`;
const base = JSON.parse(readFileSync(target, 'utf8')) as IrisTemplate;
const headers = (Papa.parse<string[]>(readFileSync(file, 'utf8'), { preview: 1 }).data[0] ?? []).filter((h) => h !== '');
if (headers.length < 5) {
  console.error('Could not read a header row from', file);
  process.exit(1);
}
const { template, unmapped } = templateFromHeaders(base, headers, basename(file), new Date().toISOString().slice(0, 10));
const { $comment: _drop, ...rest } = template as IrisTemplate & { $comment?: string };
writeFileSync(target, JSON.stringify(rest, null, 2) + '\n');
console.log(`Wrote ${target}: ${headers.length} columns, status=official.`);
if (unmapped.length) {
  console.log('\nThese headers were not recognized and will be exported blank. Map them by hand in the JSON if they need values:');
  for (const h of unmapped) console.log('  -', h);
}
