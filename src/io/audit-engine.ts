// IO operations for audit engine
// Moved from src/lib to preserve library purity

import * as fs from 'fs';
import { scanSurface } from '../lib/audit/audit-engine.ts';

export async function loadAuditFromDisk(path: string) {
  const content = fs.readFileSync(path, 'utf-8');
  return JSON.parse(content);
}

export async function saveAuditToDisk(path: string, data: any) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

export { scanSurface };
