#!/usr/bin/env npx tsx
// Test explore script with some failing observations

const observations = [
  {
    id: 'app-ready',
    pass: true,
    evidence: 'App is running',
  },
  {
    id: 'text-visible',
    pass: false,
    evidence: 'Text color matches background (low contrast)',
  },
  {
    id: 'button-clickable',
    pass: true,
    value: 5,
    evidence: 'Found 5 interactive buttons',
  },
];

const result = {
  observations,
  duration: 120,
};

console.log(JSON.stringify(result));
