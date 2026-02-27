#!/usr/bin/env npx tsx
// Test explore script — emits mock observations for testing

const observations = [
  {
    id: 'app-ready',
    pass: true,
    evidence: 'App is running',
  },
  {
    id: 'text-visible',
    pass: true,
    value: 0.95,
    evidence: 'Text contrast is sufficient (WCAG AA)',
  },
  {
    id: 'button-clickable',
    pass: true,
    evidence: 'Primary button is in viewport and interactive',
  },
];

const result = {
  observations,
  duration: 150,
};

console.log(JSON.stringify(result));
