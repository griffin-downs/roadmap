// @module cli/help
// @description Help command: print usage summary to stdout.
// @exports run

export function run(): void {
  console.log(`roadmap — DAG expansion protocol CLI

Core commands (mainline execution):
  make <spec>        Create ideal DAG from spec
  orient             Current batch position + produces/consumes
  advance [node-id]  Complete node (run validators, record evidence) or advance batch
  init               Bootstrap repo: CLAUDE.md fragment + skills install

Command groups (use 'roadmap <group> help' for details):
  spec <sub>         Spec planning: plan (gallery, select, status)
  dag <sub>          DAG mutations: insert, remove, modify, log

Discovery:
  api [<command>]    Schema discovery (input/output JSON Schema + examples + invariants)
  api --all          Full registry dump
  help               This message

All commands require --note "reason" (except help/orient/api).
Output is JSON. Add --help to any command for its full schema:
  roadmap make --help
  roadmap advance --help
  roadmap dag insert --help

Examples:
  roadmap orient --note "check position"
  roadmap make spec.json --note "create ideal DAG"
  roadmap advance my-node --note "validators pass"
  roadmap advance --note "move to next batch"
`);
}
