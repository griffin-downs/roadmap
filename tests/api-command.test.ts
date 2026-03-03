// Tests for: roadmap api <command> + schema-enriched errors

import { describe, it, expect } from 'vitest';
import { lookupSchema, listCommands, schemaToJsonSchema, schemas } from '../src/lib/schemas.ts';

describe('schemas registry', () => {
  it('lists all registered commands', () => {
    const commands = listCommands();
    expect(commands.length).toBe(10);
    const names = commands.map(c => c.command);
    expect(names).toContain('make');
    expect(names).toContain('orient');
    expect(names).toContain('advance');
    expect(names).toContain('dag.insert');
    expect(names).toContain('dag.remove');
    expect(names).toContain('dag.modify');
    expect(names).toContain('spec.plan');
    expect(names).toContain('spec.plan.gallery');
    expect(names).toContain('spec.plan.select');
    expect(names).toContain('spec.plan.status');
  });

  it('does not contain removed stubs', () => {
    const names = listCommands().map(c => c.command);
    expect(names).not.toContain('spec.compile');
    expect(names).not.toContain('spec.init');
  });

  it('lookupSchema returns undefined for unknown command', () => {
    expect(lookupSchema('nonexistent')).toBeUndefined();
  });

  it('lookupSchema returns schema for known command', () => {
    const s = lookupSchema('make');
    expect(s).toBeDefined();
    expect(s!.description).toBeTruthy();
    expect(s!.input).toBeDefined();
    expect(s!.examples.length).toBeGreaterThan(0);
  });
});

describe('schemaToJsonSchema', () => {
  it('converts make input to valid JSON Schema', () => {
    const s = lookupSchema('make')!;
    const jsonSchema = schemaToJsonSchema(s.input!);
    expect(jsonSchema).toHaveProperty('type', 'object');
    expect(jsonSchema).toHaveProperty('properties');
    const props = (jsonSchema as any).properties;
    expect(props).toHaveProperty('schema_version');
    expect(props).toHaveProperty('tasks');
    expect(props).toHaveProperty('metadata');
    expect(props).toHaveProperty('engine');
  });

  it('converts dag.insert input to valid JSON Schema', () => {
    const s = lookupSchema('dag.insert')!;
    const jsonSchema = schemaToJsonSchema(s.input!);
    expect(jsonSchema).toHaveProperty('type', 'object');
    const props = (jsonSchema as any).properties;
    expect(props).toHaveProperty('id');
    expect(props).toHaveProperty('desc');
    expect(props).toHaveProperty('deps');
    expect(props).toHaveProperty('produces');
    expect(props).toHaveProperty('validate');
  });

  it('produces $schema field', () => {
    const s = lookupSchema('orient')!;
    const jsonSchema = schemaToJsonSchema(s.output!);
    expect(jsonSchema).toHaveProperty('$schema');
  });
});

describe('every schema has examples', () => {
  for (const [cmd, schema] of Object.entries(schemas)) {
    it(`${cmd} has at least one example`, () => {
      expect(schema.examples.length).toBeGreaterThan(0);
    });

    it(`${cmd} examples all have cli string`, () => {
      for (const ex of schema.examples) {
        expect(typeof ex.cli).toBe('string');
        expect(ex.cli.length).toBeGreaterThan(0);
      }
    });
  }
});

describe('commands with input schemas have example inputs', () => {
  for (const [cmd, schema] of Object.entries(schemas)) {
    if (!schema.input) continue;
    it(`${cmd} has example with input`, () => {
      const withInput = schema.examples.filter(e => e.input);
      expect(withInput.length).toBeGreaterThan(0);
    });
  }
});

describe('CliError schema/example fields', () => {
  it('CliError interface supports schema and example', async () => {
    type CliError = import('../src/lib/cli-envelope.ts').CliError;
    const err: CliError = {
      code: 'VALIDATION_FAILED',
      message: 'test',
      schema: { type: 'object' },
      example: { foo: 'bar' },
    };
    expect(err.schema).toEqual({ type: 'object' });
    expect(err.example).toEqual({ foo: 'bar' });
  });

  it('CliError schema and example are optional', () => {
    type CliError = import('../src/lib/cli-envelope.ts').CliError;
    const err: CliError = {
      code: 'INTERNAL_ERROR',
      message: 'test',
    };
    expect(err.schema).toBeUndefined();
    expect(err.example).toBeUndefined();
  });
});
