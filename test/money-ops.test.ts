import { describe, expect, it } from 'vitest';
import { Money, type RoundingMode } from '../src/index.js';

const usd = (minor: number | bigint) => Money.of(minor, 'USD');

describe('multiply / divide / percentage', () => {
  it('multiplies by integers and exact decimals', () => {
    expect(usd(1999).multiply(3).minor).toBe(5997n);
    expect(usd(1000).multiply('1.075').minor).toBe(1075n);
    expect(usd(1000).multiply([3, 4]).minor).toBe(750n);
    expect(usd(1000).multiply(0).minor).toBe(0n);
    expect(usd(1000).multiply(-1).minor).toBe(-1000n);
  });

  it('uses HALF_EVEN by default and honours explicit modes', () => {
    // 5 cents * 0.5 = 2.5 cents
    const cases: [RoundingMode, bigint][] = [
      ['HALF_EVEN', 2n],
      ['HALF_UP', 3n],
      ['HALF_DOWN', 2n],
      ['FLOOR', 2n],
      ['CEIL', 3n],
      ['TRUNC', 2n],
    ];
    expect(usd(5).multiply('0.5').minor).toBe(2n);
    for (const [mode, expected] of cases) expect(usd(5).multiply('0.5', mode).minor).toBe(expected);
    expect(usd(-5).multiply('0.5', 'FLOOR').minor).toBe(-3n);
    expect(usd(-5).multiply('0.5', 'HALF_UP').minor).toBe(-3n);
  });

  it('avoids the classic float bug: 1.15 * 100', () => {
    // In floats 1.15 * 100 = 114.99999999999999
    expect(Money.fromMajor('1.15', 'USD').multiply(100).toMajorString()).toBe('115.00');
  });

  it('divides with rounding and rejects zero', () => {
    expect(usd(1000).divide(3).minor).toBe(333n);
    expect(usd(1000).divide(3, 'CEIL').minor).toBe(334n);
    expect(usd(1000).divide('0.5').minor).toBe(2000n);
    expect(usd(1000).divide(-4).minor).toBe(-250n);
    expect(usd(1001).divide(-2).minor).toBe(-500n); // -500.5 -> HALF_EVEN -500
    expect(() => usd(1).divide(0)).toThrow(RangeError);
    expect(() => usd(1).divide('0.00')).toThrow(RangeError);
  });

  it('computes percentages (tax, discounts, tips)', () => {
    expect(usd(10000).percentage(18).minor).toBe(1800n); // 18% GST on 100.00
    expect(usd(1999).percentage('8.875').minor).toBe(177n); // 177.41 cents -> 177
    expect(usd(1999).percentage('8.875', 'CEIL').minor).toBe(178n);
    expect(usd(250).percentage(50).minor).toBe(125n);
    expect(usd(5).percentage(50).minor).toBe(2n); // 2.5 -> 2 (even)
  });

  it('rejects an unknown rounding mode', () => {
    expect(() => usd(5).multiply('0.5', 'ROUND' as RoundingMode)).toThrow(RangeError);
  });
});

describe('allocate / split', () => {
  const minors = (ms: Money[]) => ms.map((m) => m.minor);
  const total = (ms: Money[]) => ms.reduce((a, m) => a + m.minor, 0n);

  it('splits 100 cents three ways without losing a cent', () => {
    const parts = usd(100).split(3);
    expect(minors(parts)).toEqual([34n, 33n, 33n]);
    expect(total(parts)).toBe(100n);
  });

  it('allocates by ratios with largest remainder', () => {
    // 1000 * [0.5, 0.3, 0.2]
    expect(minors(usd(1000).allocate([50, 30, 20]))).toEqual([500n, 300n, 200n]);
    // 5 cents * [70, 30] = 3.5 / 1.5 -> tie on remainder, earlier index wins
    expect(minors(usd(5).allocate([70, 30]))).toEqual([4n, 1n]);
    // 10 cents * [1, 1, 1] -> remainders equal; first gets the extra
    expect(minors(usd(10).allocate([1, 1, 1]))).toEqual([4n, 3n, 3n]);
    // largest remainder goes to the biggest fractional part, not the first index
    // 100 * [1, 2, 4] / 7 = 14.28, 28.57, 57.14 -> floors 14, 28, 57 (99) -> +1 to index 1
    expect(minors(usd(100).allocate([1, 2, 4]))).toEqual([14n, 29n, 57n]);
  });

  it('accepts decimal and tuple ratios', () => {
    expect(minors(usd(1000).allocate(['0.25', '0.75']))).toEqual([250n, 750n]);
    expect(
      minors(
        usd(999).allocate([
          [1, 3],
          [2, 3],
        ]),
      ),
    ).toEqual([333n, 666n]);
  });

  it('handles zero ratios and zero amounts', () => {
    expect(minors(usd(100).allocate([0, 1, 1]))).toEqual([0n, 50n, 50n]);
    expect(minors(usd(0).split(3))).toEqual([0n, 0n, 0n]);
  });

  it('allocates negative amounts (refunds) symmetrically', () => {
    expect(minors(usd(-100).split(3))).toEqual([-34n, -33n, -33n]);
    expect(total(usd(-100).split(3))).toBe(-100n);
  });

  it('works when the amount is smaller than the number of parts', () => {
    expect(minors(usd(2).split(5))).toEqual([1n, 1n, 0n, 0n, 0n]);
  });

  it('always sums to the original (property check)', () => {
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 48271) % 2147483647; // Park-Miller, stays within safe integers
      return seed % n;
    };
    for (let k = 0; k < 300; k++) {
      const amount = BigInt(rand(2_000_000) - 1_000_000);
      const ratios = Array.from({ length: 1 + rand(7) }, () => rand(100));
      if (!ratios.some((r) => r !== 0)) ratios[0] = 1;
      const parts = usd(amount).allocate(ratios);
      expect(total(parts)).toBe(amount);
      parts.forEach((p, i) => {
        if (ratios[i] === 0) expect(p.minor).toBe(0n);
      });
    }
  });

  it('keeps currency and exponent on every part', () => {
    const parts = Money.of(1000, 'KWD').split(3);
    expect(parts.every((p) => p.currency === 'KWD' && p.exponent === 3)).toBe(true);
    expect(minors(parts)).toEqual([334n, 333n, 333n]);
  });

  it('validates input', () => {
    expect(() => usd(100).allocate([])).toThrow(RangeError);
    expect(() => usd(100).allocate([0, 0])).toThrow(RangeError);
    expect(() => usd(100).allocate([1, -1])).toThrow(RangeError);
    expect(() => usd(100).split(0)).toThrow(RangeError);
    expect(() => usd(100).split(1.5)).toThrow(RangeError);
  });
});

describe('convert', () => {
  it('converts across exponents (USD 2 -> JPY 0, USD -> KWD 3)', () => {
    expect(usd(1000).convert('JPY', '151.37').minor).toBe(1514n); // 10.00 USD = 1513.7 JPY
    expect(usd(1000).convert('JPY', '151.37', 'FLOOR').minor).toBe(1513n);
    expect(Money.of(1514, 'JPY').convert('USD', '0.0066').minor).toBe(999n); // 9.9924 -> 9.99
    expect(usd(1000).convert('KWD', '0.3071').minor).toBe(3071n); // 3.071 KWD
    expect(usd(1999).convert('INR', '83.25').toMajorString()).toBe('1664.17');
  });

  it('accepts a [num, den] rate and rejects negative rates', () => {
    expect(usd(300).convert('EUR', [9, 10]).minor).toBe(270n);
    expect(() => usd(1).convert('EUR', '-1')).toThrow(RangeError);
  });
});
