/**
 * roadmap/agent — sealed APIs for regent-style executors
 *
 * Agents import from here. They cannot reach the DAG directly — getBrief/checkpoint/
 * advance are the only operations agents need. This boundary is intentional.
 */

export { getBrief, loadHandoffJournal } from './brief.ts';
export { checkpoint, advance, verifyBootstrapSignature } from './handoff.ts';

export type { Brief, FinalHandoff, InterimHandoff } from './brief.ts';
