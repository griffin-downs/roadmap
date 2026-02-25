import { readFileSync, readdirSync } from 'node:fs';

const results = readdirSync('tests/adoption/results')
  .map(f => JSON.parse(readFileSync('tests/adoption/results/' + f, 'utf-8')));

const wouldUse = results.filter(r => r.wouldUseInProduction).length;
const caughtError = results.filter(r => r.dagCaughtRealError).length;
const clarity = results.filter(r => r.agentBriefingClarity != null).map(r => r.agentBriefingClarity);
const avgClarity = clarity.reduce((a: number, b: number) => a + b, 0) / clarity.length;
const friction = results.filter(r => r.frictionScore != null).map(r => r.frictionScore);
const avgFriction = friction.reduce((a: number, b: number) => a + b, 0) / friction.length;
const features: Record<string, number> = {};
results.forEach(r => r.featuresExercised.forEach((f: string) => { features[f] = (features[f] || 0) + 1; }));
const errors: string[] = results.flatMap(r => r.errorsProtocolCaught);

const timeSaved = results.flatMap((r: any) =>
  r.survey.filter((s: any) => s.question === 'time-saved').map((s: any) => s.answer as number)
);
const totalTimeSaved = timeSaved.reduce((a, b) => a + b, 0);

console.log(JSON.stringify({
  wouldUse, caughtError, avgClarity, avgFriction,
  features, errorsCaught: errors.length, errors,
  timeSaved: totalTimeSaved,
  total: results.length,
}, null, 2));
