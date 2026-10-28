/**
 * Exact rational arithmetic on bigint, used for factors, ratios and rounding.
 * Never touches floating point.
 */

/** Rounding modes. HALF_* modes only differ when the discarded part is exactly one half. */
export type RoundingMode =
  | 'HALF_EVEN' // bankers' rounding: ties to the even neighbour (default; no upward bias)
  | 'HALF_UP' // ties away from zero (commercial rounding): 2.5 -> 3, -2.5 -> -3
  | 'HALF_DOWN' // ties toward zero: 2.5 -> 2, -2.5 -> -2
  | 'FLOOR' // toward negative infinity
  | 'CEIL' // toward positive infinity
  | 'TRUNC'; // toward zero

export const ROUNDING_MODES: readonly RoundingMode[] = [
  'HALF_EVEN',
  'HALF_UP',
  'HALF_DOWN',
  'FLOOR',
  'CEIL',
  'TRUNC',
];

/** A decimal string ("1.075", "-3", ".5" is NOT accepted), a number, a bigint, or [num, den]. */
export type Numeric = string | number | bigint | readonly [bigint | number, bigint | number];

/** Reduced fraction with a positive denominator. */
export interface Rational {
  num: bigint;
  den: bigint;
}

const DECIMAL_RE = /^([+-])?(\d+)(?:\.(\d+))?$/;

export const pow10 = (n: number): bigint => 10n ** BigInt(n);

/** Greatest common divisor (non-negative). */
export function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function reduce(num: bigint, den: bigint): Rational {
  if (den === 0n) throw new RangeError('Division by zero');
  if (den < 0n) [num, den] = [-num, -den];
  const g = gcd(num, den);
  return g > 1n ? { num: num / g, den: den / g } : { num, den };
}

function toBigIntStrict(v: bigint | number, what: string): bigint {
  if (typeof v === 'bigint') return v;
  if (!Number.isSafeInteger(v)) throw new RangeError(`${what} must be a safe integer, got ${v}`);
  return BigInt(v);
}

/** Parse a plain decimal string exactly ("12.345" -> 12345/1000). No exponents, no separators. */
export function parseDecimal(input: string): Rational {
  const m = DECIMAL_RE.exec(input.trim());
  if (!m) throw new SyntaxError(`Invalid decimal: "${input}"`);
  const [, sign, int, frac = ''] = m;
  let num = BigInt(int! + frac);
  if (sign === '-') num = -num;
  return reduce(num, pow10(frac.length));
}

/**
 * Convert any Numeric to an exact rational.
 * Numbers go through their shortest round-trip string (String(0.1) === "0.1"), so 0.1 means
 * exactly one tenth. Non-finite numbers and exponent notation (1e21) are rejected.
 */
export function toRational(value: Numeric): Rational {
  if (typeof value === 'bigint') return { num: value, den: 1n };
  if (typeof value === 'string') return parseDecimal(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`Non-finite number: ${value}`);
    return parseDecimal(String(value));
  }
  return reduce(toBigIntStrict(value[0], 'numerator'), toBigIntStrict(value[1], 'denominator'));
}

/** Divide num by den (den > 0) and round to an integer with the given mode. */
export function divRound(num: bigint, den: bigint, mode: RoundingMode): bigint {
  if (den <= 0n) throw new RangeError('Denominator must be positive');
  const q = num / den; // truncates toward zero
  const r = num % den; // same sign as num
  if (r === 0n) return q;

  const negative = num < 0n;
  const away = negative ? q - 1n : q + 1n; // the neighbour further from zero

  switch (mode) {
    case 'TRUNC':
      return q;
    case 'FLOOR':
      return negative ? away : q;
    case 'CEIL':
      return negative ? q : away;
    case 'HALF_UP':
    case 'HALF_DOWN':
    case 'HALF_EVEN': {
      const twice = 2n * (r < 0n ? -r : r);
      if (twice > den) return away;
      if (twice < den) return q;
      // Exactly half.
      if (mode === 'HALF_UP') return away;
      if (mode === 'HALF_DOWN') return q;
      return q % 2n === 0n ? q : away;
    }
    default:
      throw new RangeError(`Unknown rounding mode: ${String(mode)}`);
  }
}
