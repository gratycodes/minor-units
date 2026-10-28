import { CurrencyMismatchError, PrecisionError, UnknownCurrencyError } from './errors.js';
import { currencyExponent } from './currencies.js';
import {
  divRound,
  gcd,
  parseDecimal,
  pow10,
  toRational,
  ROUNDING_MODES,
  type Numeric,
  type Rational,
  type RoundingMode,
} from './rational.js';

/** Default rounding for operations that can produce fractions of a minor unit. */
export const DEFAULT_ROUNDING: RoundingMode = 'HALF_EVEN';

const CODE_RE = /^[A-Z]{3}$/;
const MAX_EXPONENT = 18;

export interface CurrencyOptions {
  /** Minor-unit digits. Required for codes outside ISO 4217; must match the table for ISO codes. */
  exponent?: number;
}

export interface FromMajorOptions extends CurrencyOptions {
  /** How to round extra digits ("1.005" USD). Without it, extra precision throws PrecisionError. */
  rounding?: RoundingMode;
}

/** JSON shape. `minor` is a string because JSON numbers lose precision beyond 2^53. */
export interface MoneyJSON {
  minor: string;
  currency: string;
  exponent: number;
}

function resolveCurrency(currency: string, options?: CurrencyOptions): [string, number] {
  if (typeof currency !== 'string') throw new TypeError('currency must be a string');
  const code = currency.trim().toUpperCase();
  if (!CODE_RE.test(code)) throw new RangeError(`Invalid currency code: "${currency}"`);

  const known = currencyExponent(code);
  const given = options?.exponent;
  if (given !== undefined) {
    if (!Number.isInteger(given) || given < 0 || given > MAX_EXPONENT) {
      throw new RangeError(`exponent must be an integer 0-${MAX_EXPONENT}, got ${given}`);
    }
    if (known !== undefined && known !== given) {
      throw new RangeError(`${code} has exponent ${known} in ISO 4217, not ${given}`);
    }
    return [code, given];
  }
  if (known === undefined) throw new UnknownCurrencyError(code);
  return [code, known];
}

function toMinor(value: bigint | number): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new RangeError(
      `Minor units must be a bigint or a safe integer, got ${String(value)}. ` +
        'Use Money.fromMajor("12.34", ...) for decimal amounts.',
    );
  }
  return BigInt(value);
}

function assertRounding(mode: RoundingMode): RoundingMode {
  if (!ROUNDING_MODES.includes(mode))
    throw new RangeError(`Unknown rounding mode: ${String(mode)}`);
  return mode;
}

/**
 * An immutable amount of money stored as an integer number of minor units (cents, fils, yen).
 * All arithmetic is exact bigint math; rounding only happens where you ask for it.
 */
export class Money {
  /** Amount in minor units, e.g. 1234n for USD 12.34. */
  readonly minor: bigint;
  /** Upper-case ISO 4217 code (or a custom code with an explicit exponent). */
  readonly currency: string;
  /** Digits after the decimal point: USD 2, JPY 0, KWD 3. */
  readonly exponent: number;

  private constructor(minor: bigint, currency: string, exponent: number) {
    this.minor = minor;
    this.currency = currency;
    this.exponent = exponent;
    Object.freeze(this);
  }

  // ---------------------------------------------------------------- factories

  /** From minor units: `Money.of(1234, 'USD')` is USD 12.34. */
  static of(minor: bigint | number, currency: string, options?: CurrencyOptions): Money {
    const [code, exp] = resolveCurrency(currency, options);
    return new Money(toMinor(minor), code, exp);
  }

  /** Zero in a currency. */
  static zero(currency: string, options?: CurrencyOptions): Money {
    return Money.of(0n, currency, options);
  }

  /**
   * From a major-unit decimal, parsed exactly: `Money.fromMajor('12.34', 'USD')` is 1234 minor.
   * Prefer strings. A number is read through its shortest string form, so 0.1 means "0.1", but
   * values produced by float math (0.1 + 0.2) carry their error and will need `rounding`.
   */
  static fromMajor(
    value: string | number | bigint,
    currency: string,
    options?: FromMajorOptions,
  ): Money {
    const [code, exp] = resolveCurrency(currency, options);
    const r: Rational =
      typeof value === 'string' ? parseDecimal(value) : toRational(value as number | bigint);
    const scaled = r.num * pow10(exp);
    if (scaled % r.den !== 0n && options?.rounding === undefined) {
      throw new PrecisionError(
        `${String(value)} has more than ${exp} decimal places for ${code}; pass { rounding }`,
      );
    }
    const mode = assertRounding(options?.rounding ?? DEFAULT_ROUNDING);
    return new Money(divRound(scaled, r.den, mode), code, exp);
  }

  /** Inverse of toJSON. Accepts `minor` as a string or safe integer. */
  static fromJSON(
    json: MoneyJSON | { minor: string | number; currency: string; exponent?: number },
  ): Money {
    if (json === null || typeof json !== 'object')
      throw new TypeError('Expected a MoneyJSON object');
    const { minor, currency, exponent } = json;
    let value: bigint;
    if (typeof minor === 'string') {
      if (!/^-?\d+$/.test(minor)) throw new SyntaxError(`Invalid minor amount: "${minor}"`);
      value = BigInt(minor);
    } else {
      value = toMinor(minor);
    }
    return Money.of(value, currency, exponent === undefined ? undefined : { exponent });
  }

  /** Sum of a list. An empty list needs `currency` to know what zero to return. */
  static sum(items: readonly Money[], currency?: string, options?: CurrencyOptions): Money {
    if (items.length === 0) {
      if (currency === undefined)
        throw new RangeError('Money.sum of an empty list needs a currency');
      return Money.zero(currency, options);
    }
    return items.reduce((acc, m) => acc.add(m));
  }

  static min(first: Money, ...rest: Money[]): Money {
    return rest.reduce((a, b) => (b.lessThan(a) ? b : a), first);
  }

  static max(first: Money, ...rest: Money[]): Money {
    return rest.reduce((a, b) => (b.greaterThan(a) ? b : a), first);
  }

  static isMoney(value: unknown): value is Money {
    return value instanceof Money;
  }

  // ---------------------------------------------------------------- arithmetic

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return this.with(this.minor + other.minor);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return this.with(this.minor - other.minor);
  }

  negate(): Money {
    return this.with(-this.minor);
  }

  abs(): Money {
    return this.minor < 0n ? this.negate() : this;
  }

  /**
   * Multiply by an exact factor: a decimal string ("1.075"), number, bigint or [num, den] ratio.
   * The result is rounded to a whole minor unit with `rounding` (default HALF_EVEN).
   */
  multiply(factor: Numeric, rounding: RoundingMode = DEFAULT_ROUNDING): Money {
    const { num, den } = toRational(factor);
    return this.with(divRound(this.minor * num, den, assertRounding(rounding)));
  }

  /** Divide by an exact divisor; throws RangeError on zero. */
  divide(divisor: Numeric, rounding: RoundingMode = DEFAULT_ROUNDING): Money {
    const { num, den } = toRational(divisor);
    if (num === 0n) throw new RangeError('Division by zero');
    // x / (num/den) = x * den / num; keep the denominator positive for divRound.
    const sign = num < 0n ? -1n : 1n;
    return this.with(divRound(this.minor * den * sign, num * sign, assertRounding(rounding)));
  }

  /** `percent`% of this amount: `price.percentage('18')` for 18% GST. */
  percentage(percent: Numeric, rounding: RoundingMode = DEFAULT_ROUNDING): Money {
    const { num, den } = toRational(percent);
    return this.with(divRound(this.minor * num, den * 100n, assertRounding(rounding)));
  }

  /**
   * Split into parts proportional to `ratios` without losing or inventing a minor unit.
   * Largest remainder method: everyone gets the floor of their exact share, then the leftover
   * units go one each to the largest fractional remainders (ties: earlier ratio first).
   * The parts always sum exactly to this amount. Ratios may be decimals; they must be >= 0
   * and not all zero.
   */
  allocate(ratios: readonly Numeric[]): Money[] {
    if (ratios.length === 0) throw new RangeError('allocate needs at least one ratio');
    const rs = ratios.map(toRational);
    // Put every ratio on a common denominator so the weights are integers.
    const common = rs.reduce((acc, r) => (acc * r.den) / gcd(acc, r.den), 1n);
    const weights = rs.map((r) => (r.num * common) / r.den);
    if (weights.some((w) => w < 0n)) throw new RangeError('Ratios must not be negative');
    const total = weights.reduce((a, b) => a + b, 0n);
    if (total === 0n) throw new RangeError('Ratios must not all be zero');

    // Allocate the absolute value, then restore the sign, so refunds split the same way.
    const negative = this.minor < 0n;
    const amount = negative ? -this.minor : this.minor;

    const shares = weights.map((w) => (amount * w) / total);
    const remainders = weights.map((w, i) => ({ i, rem: (amount * w) % total }));
    let leftover = amount - shares.reduce((a, b) => a + b, 0n);

    remainders.sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
    for (const { i } of remainders) {
      if (leftover === 0n) break;
      shares[i] = shares[i]! + 1n;
      leftover -= 1n;
    }
    return shares.map((s) => this.with(negative ? -s : s));
  }

  /** Split into `parts` equal shares; the first shares absorb any leftover units. */
  split(parts: number): Money[] {
    if (!Number.isSafeInteger(parts) || parts < 1) {
      throw new RangeError(`parts must be a positive integer, got ${parts}`);
    }
    return this.allocate(new Array<number>(parts).fill(1));
  }

  /**
   * Convert to another currency at `rate` (units of target per one unit of this currency,
   * as an exact decimal string or ratio). Handles different exponents (USD 2 -> JPY 0).
   */
  convert(
    currency: string,
    rate: Numeric,
    rounding: RoundingMode = DEFAULT_ROUNDING,
    options?: CurrencyOptions,
  ): Money {
    const [code, exp] = resolveCurrency(currency, options);
    const { num, den } = toRational(rate);
    if (num < 0n) throw new RangeError('Exchange rate must not be negative');
    // target_minor = minor / 10^fromExp * rate * 10^toExp
    let n = this.minor * num;
    let d = den;
    if (exp >= this.exponent) n *= pow10(exp - this.exponent);
    else d *= pow10(this.exponent - exp);
    return new Money(divRound(n, d, assertRounding(rounding)), code, exp);
  }

  // ---------------------------------------------------------------- comparison

  /** -1, 0 or 1. Throws CurrencyMismatchError across currencies. */
  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    return this.minor < other.minor ? -1 : this.minor > other.minor ? 1 : 0;
  }

  equals(other: Money): boolean {
    return this.compare(other) === 0;
  }
  lessThan(other: Money): boolean {
    return this.compare(other) < 0;
  }
  lessThanOrEqual(other: Money): boolean {
    return this.compare(other) <= 0;
  }
  greaterThan(other: Money): boolean {
    return this.compare(other) > 0;
  }
  greaterThanOrEqual(other: Money): boolean {
    return this.compare(other) >= 0;
  }
  isZero(): boolean {
    return this.minor === 0n;
  }
  isPositive(): boolean {
    return this.minor > 0n;
  }
  isNegative(): boolean {
    return this.minor < 0n;
  }
  hasSameCurrency(other: Money): boolean {
    return this.currency === other.currency && this.exponent === other.exponent;
  }

  // ---------------------------------------------------------------- output

  /** Exact major-unit decimal string: "12.34", "-0.05", "1235" (JPY), "1.234" (KWD). */
  toMajorString(): string {
    const negative = this.minor < 0n;
    const digits = (negative ? -this.minor : this.minor).toString();
    if (this.exponent === 0) return (negative ? '-' : '') + digits;
    const padded = digits.padStart(this.exponent + 1, '0');
    const int = padded.slice(0, -this.exponent);
    const frac = padded.slice(-this.exponent);
    return `${negative ? '-' : ''}${int}.${frac}`;
  }

  /** Minor units as a number; throws if outside the safe integer range. */
  toNumber(): number {
    const n = Number(this.minor);
    if (!Number.isSafeInteger(n)) throw new RangeError('Amount exceeds Number.MAX_SAFE_INTEGER');
    return n;
  }

  /**
   * Locale-aware display via Intl.NumberFormat (style "currency"). Fraction digits default to the
   * currency exponent; override anything with `options`. The exact decimal string is passed to
   * Intl, so Node 19+ formats very large amounts without float rounding.
   */
  format(locales?: string | readonly string[], options?: Intl.NumberFormatOptions): string {
    const nf = new Intl.NumberFormat(locales as string | string[] | undefined, {
      style: 'currency',
      currency: this.currency,
      minimumFractionDigits: this.exponent,
      maximumFractionDigits: this.exponent,
      ...options,
    });
    // Intl.NumberFormat.format accepts decimal strings (exact on Node 19+, Number on Node 18).
    return nf.format(this.toMajorString() as unknown as number);
  }

  toJSON(): MoneyJSON {
    return { minor: this.minor.toString(), currency: this.currency, exponent: this.exponent };
  }

  /** "12.34 USD". For display to users, use format(). */
  toString(): string {
    return `${this.toMajorString()} ${this.currency}`;
  }

  // ---------------------------------------------------------------- internals

  private with(minor: bigint): Money {
    return new Money(minor, this.currency, this.exponent);
  }

  private assertSameCurrency(other: Money): void {
    if (!(other instanceof Money)) throw new TypeError('Expected a Money instance');
    if (!this.hasSameCurrency(other)) {
      throw new CurrencyMismatchError(
        `${this.currency}/${this.exponent}`,
        `${other.currency}/${other.exponent}`,
      );
    }
  }
}
