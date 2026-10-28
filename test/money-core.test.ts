import { describe, expect, it } from 'vitest';
import {
  CURRENCY_EXPONENTS,
  CurrencyMismatchError,
  Money,
  PrecisionError,
  UnknownCurrencyError,
  currencyExponent,
} from '../src/index.js';

const usd = (minor: number | bigint) => Money.of(minor, 'USD');

describe('currency table', () => {
  it.each([
    ['USD', 2],
    ['EUR', 2],
    ['INR', 2],
    ['GBP', 2],
    ['JPY', 0],
    ['KRW', 0],
    ['CLP', 0],
    ['ISK', 0],
    ['VND', 0],
    ['KWD', 3],
    ['BHD', 3],
    ['OMR', 3],
    ['JOD', 3],
    ['TND', 3],
    ['CLF', 4],
    ['UYW', 4],
  ])('%s has exponent %d', (code, exp) => {
    expect(currencyExponent(code)).toBe(exp);
    expect(Money.zero(code).exponent).toBe(exp);
  });

  it('is frozen and has no prototype keys', () => {
    expect(Object.isFrozen(CURRENCY_EXPONENTS)).toBe(true);
    expect(currencyExponent('constructor')).toBeUndefined();
    expect(currencyExponent('XYZ')).toBeUndefined();
  });
});

describe('Money.of', () => {
  it('stores minor units as bigint and normalises the code', () => {
    const m = Money.of(1234, 'usd');
    expect(m.minor).toBe(1234n);
    expect(m.currency).toBe('USD');
    expect(m.exponent).toBe(2);
  });

  it('accepts bigints beyond the safe integer range', () => {
    const big = 2n ** 80n;
    expect(Money.of(big, 'USD').minor).toBe(big);
  });

  it.each([1.5, Number.NaN, Infinity, 2 ** 53])('rejects non-safe-integer number %s', (n) => {
    expect(() => Money.of(n, 'USD')).toThrow(RangeError);
  });

  it('rejects invalid and unknown codes', () => {
    expect(() => Money.of(1, 'US')).toThrow(RangeError);
    expect(() => Money.of(1, 'US1')).toThrow(RangeError);
    expect(() => Money.of(1, 'XYZ')).toThrow(UnknownCurrencyError);
  });

  it('supports custom codes with an explicit exponent', () => {
    const pts = Money.of(5, 'PTS', { exponent: 0 });
    expect(pts.exponent).toBe(0);
    expect(Money.of(1, 'BTC', { exponent: 8 }).toMajorString()).toBe('0.00000001');
  });

  it('rejects an exponent that contradicts ISO 4217 or is out of range', () => {
    expect(() => Money.of(1, 'USD', { exponent: 3 })).toThrow(RangeError);
    expect(() => Money.of(1, 'ABC', { exponent: -1 })).toThrow(RangeError);
    expect(() => Money.of(1, 'ABC', { exponent: 19 })).toThrow(RangeError);
    expect(() => Money.of(1, 'ABC', { exponent: 1.5 })).toThrow(RangeError);
    expect(Money.of(1, 'USD', { exponent: 2 }).exponent).toBe(2);
  });

  it('is immutable', () => {
    const m = usd(100);
    expect(Object.isFrozen(m)).toBe(true);
    expect(() => {
      (m as { minor: bigint }).minor = 5n;
    }).toThrow(TypeError);
  });
});

describe('Money.fromMajor', () => {
  it.each([
    ['12.34', 'USD', 1234n],
    ['0.1', 'USD', 10n],
    ['-0.05', 'USD', -5n],
    ['1000', 'JPY', 1000n],
    ['1.234', 'KWD', 1234n],
    ['19.990', 'USD', 1999n],
    ['92233720368547758.07', 'USD', 9223372036854775807n],
  ])('parses %s %s exactly', (s, c, minor) => {
    expect(Money.fromMajor(s, c).minor).toBe(minor);
  });

  it('has no float error: 0.1 + 0.2 as strings', () => {
    const sum = Money.fromMajor('0.1', 'USD').add(Money.fromMajor('0.2', 'USD'));
    expect(sum.toMajorString()).toBe('0.30');
  });

  it('accepts numbers and bigints', () => {
    expect(Money.fromMajor(19.99, 'USD').minor).toBe(1999n);
    expect(Money.fromMajor(5n, 'USD').minor).toBe(500n);
  });

  it('throws PrecisionError on extra digits unless a rounding mode is given', () => {
    expect(() => Money.fromMajor('1.005', 'USD')).toThrow(PrecisionError);
    expect(() => Money.fromMajor('1.5', 'JPY')).toThrow(PrecisionError);
    expect(() => Money.fromMajor(0.1 + 0.2, 'USD')).toThrow(PrecisionError);
    expect(Money.fromMajor('1.005', 'USD', { rounding: 'HALF_UP' }).minor).toBe(101n);
    expect(Money.fromMajor('1.005', 'USD', { rounding: 'HALF_EVEN' }).minor).toBe(100n);
    expect(Money.fromMajor('2.5', 'JPY', { rounding: 'HALF_EVEN' }).minor).toBe(2n);
    expect(Money.fromMajor(0.1 + 0.2, 'USD', { rounding: 'HALF_EVEN' }).minor).toBe(30n);
  });

  it('rejects malformed input', () => {
    expect(() => Money.fromMajor('12,34', 'USD')).toThrow(SyntaxError);
    expect(() => Money.fromMajor('$5', 'USD')).toThrow(SyntaxError);
    expect(() => Money.fromMajor('', 'USD')).toThrow(SyntaxError);
  });
});

describe('arithmetic and comparison', () => {
  it('adds, subtracts, negates and takes abs', () => {
    expect(usd(150).add(usd(275)).minor).toBe(425n);
    expect(usd(150).subtract(usd(275)).minor).toBe(-125n);
    expect(usd(150).negate().minor).toBe(-150n);
    expect(usd(-150).abs().minor).toBe(150n);
    const p = usd(5);
    expect(p.abs()).toBe(p);
  });

  it('never mutates operands', () => {
    const a = usd(100);
    a.add(usd(1));
    expect(a.minor).toBe(100n);
  });

  it('throws CurrencyMismatchError across currencies', () => {
    const eur = Money.of(100, 'EUR');
    expect(() => usd(100).add(eur)).toThrow(CurrencyMismatchError);
    expect(() => usd(100).subtract(eur)).toThrow(CurrencyMismatchError);
    expect(() => usd(100).compare(eur)).toThrow(CurrencyMismatchError);
    expect(() => usd(100).equals(eur)).toThrow(CurrencyMismatchError);
    try {
      usd(1).add(eur);
    } catch (e) {
      expect((e as CurrencyMismatchError).left).toBe('USD/2');
      expect((e as CurrencyMismatchError).right).toBe('EUR/2');
    }
  });

  it('treats the same custom code with different exponents as a mismatch', () => {
    const a = Money.of(1, 'PTS', { exponent: 0 });
    const b = Money.of(1, 'PTS', { exponent: 2 });
    expect(a.hasSameCurrency(b)).toBe(false);
    expect(() => a.add(b)).toThrow(CurrencyMismatchError);
  });

  it('compares', () => {
    expect(usd(1).compare(usd(2))).toBe(-1);
    expect(usd(2).compare(usd(2))).toBe(0);
    expect(usd(3).compare(usd(2))).toBe(1);
    expect(usd(2).equals(usd(2))).toBe(true);
    expect(usd(1).lessThan(usd(2))).toBe(true);
    expect(usd(2).lessThanOrEqual(usd(2))).toBe(true);
    expect(usd(3).greaterThan(usd(2))).toBe(true);
    expect(usd(2).greaterThanOrEqual(usd(3))).toBe(false);
    expect(usd(0).isZero()).toBe(true);
    expect(usd(1).isPositive()).toBe(true);
    expect(usd(-1).isNegative()).toBe(true);
    expect(usd(0).isPositive() || usd(0).isNegative()).toBe(false);
  });

  it('sums, mins and maxes', () => {
    expect(Money.sum([usd(1), usd(2), usd(3)]).minor).toBe(6n);
    expect(Money.sum([], 'JPY').equals(Money.zero('JPY'))).toBe(true);
    expect(() => Money.sum([])).toThrow(RangeError);
    expect(() => Money.sum([usd(1), Money.of(1, 'EUR')])).toThrow(CurrencyMismatchError);
    expect(Money.min(usd(5), usd(-2), usd(3)).minor).toBe(-2n);
    expect(Money.max(usd(5), usd(-2), usd(3)).minor).toBe(5n);
    expect(Money.isMoney(usd(1))).toBe(true);
    expect(Money.isMoney({ minor: 1n })).toBe(false);
  });

  it('rejects non-Money operands', () => {
    expect(() =>
      usd(1).add({ minor: 1n, currency: 'USD', exponent: 2 } as unknown as Money),
    ).toThrow(TypeError);
  });
});
