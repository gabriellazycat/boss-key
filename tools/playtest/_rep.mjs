import fs from 'node:fs';
import path from 'node:path';
import { analyze, renderReport } from './analyze.mjs';
const dir = process.argv[2];
const runs = fs.readdirSync(path.join(dir, 'runs')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, 'runs', f), 'utf8')));
const s = analyze(runs, { maxDays: +(process.argv[3] ?? 12) });
fs.writeFileSync(path.join(dir, 'report.md'), renderReport(s));
console.log(renderReport(s));
