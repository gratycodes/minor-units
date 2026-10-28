/**
 * ISO 4217 minor-unit exponents (number of digits after the decimal point).
 * Source: ISO 4217 list one (active codes). Most currencies use 2; only the exceptions differ.
 */

// prettier-ignore
const ZERO_DECIMAL = [
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'UYI', 'VND',
  'VUV', 'XAF', 'XOF', 'XPF',
] as const;

// prettier-ignore
const THREE_DECIMAL = ['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'] as const;

// prettier-ignore
const FOUR_DECIMAL = ['CLF', 'UYW'] as const;

// prettier-ignore
const TWO_DECIMAL = [
  'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT',
  'BGN', 'BMD', 'BND', 'BOB', 'BOV', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF',
  'CHE', 'CHF', 'CHW', 'CNY', 'COP', 'COU', 'CRC', 'CUP', 'CVE', 'CZK', 'DKK', 'DOP', 'DZD',
  'EGP', 'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GTQ', 'GYD',
  'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IRR', 'JMD', 'KES', 'KGS', 'KHR', 'KPW',
  'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT',
  'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MXV', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK',
  'NPR', 'NZD', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'QAR', 'RON', 'RSD', 'RUB', 'SAR',
  'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP',
  'SZL', 'THB', 'TJS', 'TMT', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'USD', 'USN', 'UYU',
  'UZS', 'VED', 'VES', 'WST', 'XCD', 'XCG', 'YER', 'ZAR', 'ZMW', 'ZWG',
] as const;

function table(): Readonly<Record<string, number>> {
  const t: Record<string, number> = {};
  for (const c of TWO_DECIMAL) t[c] = 2;
  for (const c of ZERO_DECIMAL) t[c] = 0;
  for (const c of THREE_DECIMAL) t[c] = 3;
  for (const c of FOUR_DECIMAL) t[c] = 4;
  return Object.freeze(t);
}

/** Currency code -> exponent. Frozen; pass `{ exponent }` to factories for other codes. */
export const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = table();

/** Exponent for an ISO 4217 code, or `undefined` if the code is not in the table. */
export function currencyExponent(code: string): number | undefined {
  return Object.prototype.hasOwnProperty.call(CURRENCY_EXPONENTS, code)
    ? CURRENCY_EXPONENTS[code]
    : undefined;
}
