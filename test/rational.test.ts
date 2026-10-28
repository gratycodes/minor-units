import { describe, expect, it } from 'vitest';
import {
  divRound,
  parseDecimal,
  toRational,
  ROUNDING_MODES,
  type RoundingMode,
} from '../src/index.js';

describe('parseDecimal', () => {
  it.each([
    ['0', 0n, 1n],
    ['12.34', 617n, 50n],
    ['-0.5', -1n, 2n],
    ['+3', 3n, 1n],
    ['1.000', 1n, 1n],
    ['  7.25 ', 29n, 4n],
    ['123456789012345678901234567890.01', 12345678901234567890123456789001n, 100n],
  ])('%s -> %s/%s', (s, num, den) => {
    expect(parseDecimal(s)).toEqual({ num, den });
  });

  it.each(['', '.5', '5.', '1e3', '1,000', '1_000', 'abc', '--1', '0x10', 'NaN', '1.2.3'])(
    'rejects %j',
    (s) => {
      expect(() => parseDecimal(s)).toThrow(SyntaxError);
    },
  );
});

describe('toRational', () => {
  it('reads numbers through their shortest string (0.1 is exactly 1/10)', () => {
    expect(toRational(0.1)).toEqual({ num: 1n, den: 10n });
    expect(toRational(1.075)).toEqual({ num: 43n, den: 40n });
  });
  it('keeps float error visible rather than hiding it', () => {
    expect(toRational(0.1 + 0.2)).toEqual({ num: 7500000000000001n, den: 25000000000000000n });
  });
  it('accepts bigint and [num, den] tuples, normalising sign', () => {
    expect(toRational(5n)).toEqual({ num: 5n, den: 1n });
    expect(toRational([2, -6])).toEqual({ num: -1n, den: 3n });
  });
  it('rejects non-finite numbers, exponent notation, zero denominators and unsafe tuple parts', () => {
    expect(() => toRational(Infinity)).toThrow(RangeError);
    expect(() => toRational(Number.NaN)).toThrow(RangeError);
    expect(() => toRational(1e21)).toThrow(SyntaxError);
    expect(() => toRational([1, 0])).toThrow(RangeError);
    expect(() => toRational([0.5, 1])).toThrow(RangeError);
  });
});

describe('divRound', () => {
  // value = num/den; rows: [num, den, HALF_EVEN, HALF_UP, HALF_DOWN, FLOOR, CEIL, TRUNC]
  const rows: [bigint, bigint, ...bigint[]][] = [
    [25n, 10n, 2n, 3n, 2n, 2n, 3n, 2n], // 2.5
    [35n, 10n, 4n, 4n, 3n, 3n, 4n, 3n], // 3.5
    [-25n, 10n, -2n, -3n, -2n, -3n, -2n, -2n], // -2.5
    [-35n, 10n, -4n, -4n, -3n, -4n, -3n, -3n], // -3.5
    [26n, 10n, 3n, 3n, 3n, 2n, 3n, 2n], // 2.6
    [24n, 10n, 2n, 2n, 2n, 2n, 3n, 2n], // 2.4
    [-26n, 10n, -3n, -3n, -3n, -3n, -2n, -2n], // -2.6
    [-24n, 10n, -2n, -2n, -2n, -3n, -2n, -2n], // -2.4
    [5n, 10n, 0n, 1n, 0n, 0n, 1n, 0n], // 0.5
    [-5n, 10n, 0n, -1n, 0n, -1n, 0n, 0n], // -0.5
    [1n, 3n, 0n, 0n, 0n, 0n, 1n, 0n], // 0.333
    [2n, 3n, 1n, 1n, 1n, 0n, 1n, 0n], // 0.666
    [40n, 10n, 4n, 4n, 4n, 4n, 4n, 4n], // exact
  ];
  const modes: RoundingMode[] = ['HALF_EVEN', 'HALF_UP', 'HALF_DOWN', 'FLOOR', 'CEIL', 'TRUNC'];

  for (const [num, den, ...expected] of rows) {
    modes.forEach((mode, i) => {
      it(`${num}/${den} ${mode} -> ${expected[i]}`, () => {
        expect(divRound(num, den, mode)).toBe(expected[i]);
      });
    });
  }

  it('lists all modes', () => {
    expect([...ROUNDING_MODES].sort()).toEqual([...modes].sort());
  });

  it('rejects a non-positive denominator and unknown modes', () => {
    expect(() => divRound(1n, 0n, 'FLOOR')).toThrow(RangeError);
    expect(() => divRound(1n, -2n, 'FLOOR')).toThrow(RangeError);
    expect(() => divRound(1n, 2n, 'NEAREST' as RoundingMode)).toThrow(RangeError);
  });
});
