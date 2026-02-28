// @module rate-card
// @exports RateCard, loadRateCard, computeRateCardHash
// @types RateCard, ModelRate
// @entry roadmap

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export interface ModelRate {
  model: string;
  inputPerMToken: number;   // USD per million input tokens
  outputPerMToken: number;  // USD per million output tokens
}

export interface RateCard {
  schemaVersion: number;
  rates: ModelRate[];
  rateCardHash?: string;  // sha256 of content, populated after load
}

const RATES_PATH = (repoRoot: string) => join(repoRoot, '.roadmap', 'rates.json');

export function computeRateCardHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function loadRateCard(repoRoot: string): RateCard | null {
  const path = RATES_PATH(repoRoot);
  if (!existsSync(path)) return null;
  const content = readFileSync(path, 'utf-8');
  const card = JSON.parse(content) as RateCard;
  card.rateCardHash = computeRateCardHash(content);
  return card;
}
