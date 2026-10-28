/** Thrown when two amounts in different currencies (or exponents) are combined or compared. */
export class CurrencyMismatchError extends Error {
  readonly left: string;
  readonly right: string;

  constructor(left: string, right: string) {
    super(`Currency mismatch: ${left} vs ${right}`);
    this.name = 'CurrencyMismatchError';
    this.left = left;
    this.right = right;
  }
}

/** Thrown for a currency code that is not in the ISO 4217 table and has no explicit exponent. */
export class UnknownCurrencyError extends Error {
  readonly currency: string;

  constructor(currency: string) {
    super(`Unknown currency "${currency}": pass { exponent } for non-ISO codes`);
    this.name = 'UnknownCurrencyError';
    this.currency = currency;
  }
}

/** Thrown when a value would need rounding but no rounding mode was given (e.g. "1.005" USD). */
export class PrecisionError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = 'PrecisionError';
  }
}
