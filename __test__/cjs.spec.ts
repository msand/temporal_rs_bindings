import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('CJS require', () => {
  it('can require the conformance layer', () => {
    const { Temporal } = require('../lib/temporal.js');
    expect(Temporal).toBeDefined();
    expect(typeof Temporal.PlainDate).toBe('function');
    const d = new Temporal.PlainDate(2024, 3, 15);
    expect(d.toString()).toBe('2024-03-15');
  });
});
