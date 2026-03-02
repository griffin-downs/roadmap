import { createTrendAnalyzer } from '../src/lib/mining/trend-analyzer';
import * as fs from 'fs';

const analyzer = createTrendAnalyzer('./transcript-index.jsonl');
const report = analyzer.generateReport();

// Write report to JSON
fs.writeFileSync('trend-report-latest.json', JSON.stringify(report, null, 2) + '\n');

console.log('Trend report generated: trend-report-latest.json');
console.log(JSON.stringify(report, null, 2));
