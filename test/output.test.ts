import { describe, expect, it } from 'vitest';
import { Money } from '../src/index.js';

/** ICU versions differ in which space they use (NBSP, narrow NBSP); normalise for comparison. */
const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('toMajorString / toString / toNumber', () => {
  it.each([
    [1234n, 'USD', '12.34'],
    [5n, 'USD', '0.05'],
    [-5n, 'USD', '-0.05'],
    [0n, 'USD', '0.00'],
    [-120n, 'USD', '-1.20'],
    [1235n, 'JPY', '1235'],
    [-7n, 'JPY', '-7'],
    [1234n, 'KWD', '1.234'],
    [1n, 'KWD', '0.001'],
    [10n ** 30n + 1n, 'USD', '10000000000000000000000000000.01'],
  ])('%s minor %s -> %s', (minor, code, expected) => {
    expect(Money.of(minor, code).toMajorString()).toBe(expected);
  });

  it('toString includes the code', () => {
    expect(Money.of(1234, 'EUR').toString()).toBe('12.34 EUR');
    expect(`${Money.of(-50, 'GBP')}`).toBe('-0.50 GBP');
  });

  it('toNumber returns safe integers and refuses larger ones', () => {
    expect(Money.of(1234, 'USD').toNumber()).toBe(1234);
    expect(() => Money.of(2n ** 60n, 'USD').toNumber()).toThrow(RangeError);
  });
});

describe('format (Intl.NumberFormat)', () => {
  it('formats with locale conventions', () => {
    expect(Money.of(123450, 'USD').format('en-US')).toBe('$1,234.50');
    expect(norm(Money.of(123450, 'EUR').format('de-DE'))).toBe('1.234,50 €');
    expect(Money.of(1235, 'JPY').format('en-US')).toBe('¥1,235');
    expect(Money.of(12345678950, 'INR').format('en-IN')).toBe('₹12,34,56,789.50');
    expect(Money.of(-500, 'USD').format('en-US')).toBe('-$5.00');
  });

  it('shows all minor digits for 3-decimal currencies', () => {
    expect(norm(Money.of(1234, 'KWD').format('en-US'))).toBe('KWD 1.234');
  });

  it('lets callers override Intl options', () => {
    expect(
      Money.of(123450, 'USD').format('en-US', { currencyDisplay: 'code' }).replace(/\s/g, ' '),
    ).toBe('USD 1,234.50');
    expect(
      Money.of(123400, 'USD').format('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    ).toBe('$1,234');
  });

  it('respects a custom exponent for non-ISO codes', () => {
    expect(norm(Money.of(150000000, 'BTC', { exponent: 8 }).format('en-US'))).toBe(
      'BTC 1.50000000',
    );
  });
});

describe('JSON', () => {
  it('round-trips through JSON.stringify / fromJSON, including huge amounts', () => {
    for (const m of [
      Money.of(1234, 'USD'),
      Money.of(-1, 'KWD'),
      Money.of(2n ** 90n, 'JPY'),
      Money.of(7, 'PTS', { exponent: 1 }),
    ]) {
      const json = JSON.parse(JSON.stringify(m));
      const back = Money.fromJSON(json);
      expect(back.equals(m)).toBe(true);
      expect(back.exponent).toBe(m.exponent);
    }
  });

  it('serialises minor as a string', () => {
    expect(JSON.stringify(Money.of(1234, 'USD'))).toBe(
      '{"minor":"1234","currency":"USD","exponent":2}',
    );
  });

  it('accepts a numeric minor and an omitted exponent for ISO codes', () => {
    expect(Money.fromJSON({ minor: 500, currency: 'EUR' }).minor).toBe(500n);
  });

  it('rejects bad payloads', () => {
    expect(() => Money.fromJSON({ minor: '12.5', currency: 'USD' })).toThrow(SyntaxError);
    expect(() => Money.fromJSON({ minor: 1.5, currency: 'USD' })).toThrow(RangeError);
    expect(() => Money.fromJSON({ minor: '1', currency: 'USD', exponent: 3 })).toThrow(RangeError);
    expect(() => Money.fromJSON(null as unknown as { minor: string; currency: string })).toThrow(
      TypeError,
    );
  });
});
