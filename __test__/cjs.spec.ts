import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('CJS require', () => {
  const { Temporal } = require('../lib/temporal.js');

  it('can require the conformance layer', () => {
    expect(Temporal).toBeDefined();
    expect(typeof Temporal.PlainDate).toBe('function');
    const d = new Temporal.PlainDate(2024, 3, 15);
    expect(d.toString()).toBe('2024-03-15');
  });

  it('exports PlainTime', () => {
    expect(typeof Temporal.PlainTime).toBe('function');
    const t = new Temporal.PlainTime(13, 30, 45);
    expect(t.hour).toBe(13);
    expect(t.minute).toBe(30);
    expect(t.second).toBe(45);
  });

  it('exports PlainDateTime', () => {
    expect(typeof Temporal.PlainDateTime).toBe('function');
    const dt = new Temporal.PlainDateTime(2024, 3, 15, 13, 30, 45);
    expect(dt.year).toBe(2024);
    expect(dt.hour).toBe(13);
  });

  it('exports PlainYearMonth', () => {
    expect(typeof Temporal.PlainYearMonth).toBe('function');
    const ym = new Temporal.PlainYearMonth(2024, 3);
    expect(ym.year).toBe(2024);
    expect(ym.month).toBe(3);
  });

  it('exports PlainMonthDay', () => {
    expect(typeof Temporal.PlainMonthDay).toBe('function');
    const md = new Temporal.PlainMonthDay(12, 25);
    expect(md.day).toBe(25);
  });

  it('exports ZonedDateTime', () => {
    expect(typeof Temporal.ZonedDateTime).toBe('function');
    const zdt = Temporal.ZonedDateTime.from('2024-03-15T12:00:00Z[UTC]');
    expect(zdt.year).toBe(2024);
  });

  it('exports Instant', () => {
    expect(typeof Temporal.Instant).toBe('function');
    const inst = Temporal.Instant.fromEpochMilliseconds(1710500000000);
    expect(inst.epochMilliseconds).toBe(1710500000000);
  });

  it('exports Duration', () => {
    expect(typeof Temporal.Duration).toBe('function');
    const d = Temporal.Duration.from('P1Y2M3D');
    expect(d.years).toBe(1);
    expect(d.months).toBe(2);
    expect(d.days).toBe(3);
  });

  it('exports Now', () => {
    expect(Temporal.Now).toBeDefined();
    expect(typeof Temporal.Now.instant).toBe('function');
    const inst = Temporal.Now.instant();
    expect(inst.epochMilliseconds).toBeGreaterThan(0);
  });
});
