import { describe, it, expect } from 'vitest';
import {
  writeJson,
  writeJsonError,
  assertNoDecorativeOutputWhenJson,
  ensureParseableJson,
  validateJsonCommandOutput,
} from './json-output.js';

describe('JSON Output Consistency', () => {
  it('writeJson outputs valid JSON', () => {
    const data = { runId: 'test', status: 'completed' };
    // Capture console.log
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      writeJson(data);
      expect(logs.length).toBe(1);
      const parsed = JSON.parse(logs[0]);
      expect(parsed).toEqual(data);
    } finally {
      console.log = originalLog;
    }
  });

  it('writeJsonError outputs JSON with error field', () => {
    const logs: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      writeJsonError('Something went wrong', 1);
      expect(logs.length).toBe(1);
      const parsed = JSON.parse(logs[0]);
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toBe('Something went wrong');
    } finally {
      console.error = originalError;
    }
  });

  it('assertNoDecorativeOutputWhenJson throws on emoji', () => {
    expect(() => assertNoDecorativeOutputWhenJson('run', '{"ok": true} ✅')).toThrow('decorative');
  });

  it('assertNoDecorativeOutputWhenJson passes on clean JSON', () => {
    expect(() => assertNoDecorativeOutputWhenJson('run', '{"ok": true}')).not.toThrow();
  });

  it('ensureParseableJson parses valid JSON', () => {
    const result = ensureParseableJson('{"status":"ok"}');
    expect(result).toEqual({ status: 'ok' });
  });

  it('ensureParseableJson throws on invalid JSON', () => {
    expect(() => ensureParseableJson('not json')).toThrow('parse error');
  });

  it('validateJsonCommandOutput returns valid for correct output', () => {
    const { valid, missingFields } = validateJsonCommandOutput('run', '{"runId":"x","status":"ok"}', ['runId', 'status']);
    expect(valid).toBe(true);
    expect(missingFields).toEqual([]);
  });

  it('validateJsonCommandOutput returns invalid for missing fields', () => {
    const { valid, missingFields } = validateJsonCommandOutput('run', '{"runId":"x"}', ['runId', 'status']);
    expect(valid).toBe(false);
    expect(missingFields).toContain('status');
  });
});
