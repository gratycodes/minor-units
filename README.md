# minor-units

Safe money math for JavaScript and TypeScript. Amounts are stored as **integer minor units**
(cents, paise, fils, yen) in a `bigint`, so there is no floating-point error, and every operation
that could produce a fraction of a cent asks you how to round.

- Exact parsing of decimal strings: `'0.1' + '0.2'` is `0.30`, not `0.30000000000000004`
- ISO 4217 exponents built in: USD/EUR/INR 2, JPY/KRW 0, KWD/BHD/OMR 3, CLF 4
- Rounding modes: `HALF_EVEN` (bankers', default), `HALF_UP`, `HALF_DOWN`, `FLOOR`, `CEIL`, `TRUNC`
- `allocate` / `split` that never lose or invent a cent (largest remainder method)
- Percentages and tax, FX conversion across exponents, comparisons
- Currency-mismatch errors instead of silently adding dollars to euros
- Locale formatting with `Intl.NumberFormat`, and lossless `toJSON` / `fromJSON`
- Immutable, zero runtime dependencies, ESM + CommonJS + types, Node.js 18+

> Status: 0.1.0, not yet published to npm.

```sh
npm install minor-units
```

```ts
import { Money } from 'minor-units';

const price = Money.fromMajor('19.99', 'USD'); // 1999 minor units
const same = Money.of(1999, 'USD');
price.equals(same); // true
price.format('en-US'); // "$19.99"
```

## Why integer minor units?

```js
0.1 + 0.2; // 0.30000000000000004
1.15 * 100; // 114.99999999999999
```

Binary floating point can't represent most decimal fractions exactly. Money libraries in banks
and payment systems store integer minor units and round explicitly. `minor-units` does the same with
`bigint`, so there is no upper limit and no silent precision loss.

## Practical examples

### Cart total with discount and sales tax

```ts
const items = [
  { price: '19.99', qty: 2 },
  { price: '4.50', qty: 3 },
  { price: '0.99', qty: 1 },
];

const subtotal = Money.sum(items.map((i) => Money.fromMajor(i.price, 'USD').multiply(i.qty)));
// 54.47 USD

const discount = subtotal.percentage(10); // 5.45 USD (5.447, HALF_EVEN)
const afterDiscount = subtotal.subtract(discount); // 49.02 USD
const tax = afterDiscount.percentage('8.875', 'HALF_UP'); // 4.35 USD
const total = afterDiscount.add(tax);
total.format('en-US'); // "$53.37"
```

Pass rates as **strings** (`'8.875'`) so they are exact decimals.

### Tax-inclusive prices (e.g. India GST at 18%)

```ts
const gross = Money.fromMajor('1180', 'INR');
const net = gross.divide('1.18'); // ₹1,000.00
const gst = gross.subtract(net); // ₹180.00  (subtract, so net + gst === gross exactly)
const [cgst, sgst] = gst.split(2); // 90.00 INR each
net.format('en-IN'); // "₹1,000.00"
```

### Splitting a bill

```ts
Money.fromMajor('100.00', 'USD')
  .split(3)
  .map((m) => m.format('en-US'));
// ["$33.34", "$33.33", "$33.33"]  (sums to exactly $100.00)

// Uneven shares: one person had twice as much
Money.fromMajor('84.50', 'USD').allocate([2, 1, 1]).map(String);
// ["42.25 USD", "21.13 USD", "21.12 USD"]
```

### Refunds

```ts
const paid = Money.fromMajor('120.00', 'EUR');
const refund = paid.percentage(25).negate(); // -30.00 EUR

// Split the refund across two payment methods used 70/30
refund.allocate([70, 30]).map(String); // ["-21.00 EUR", "-9.00 EUR"]

// Pro-rate a 50.00 EUR discount across order lines by their value
const lines = ['33.33', '33.33', '33.34'].map((p) => Money.fromMajor(p, 'EUR'));
Money.fromMajor('50.00', 'EUR')
  .allocate(lines.map((l) => l.minor))
  .map(String);
// ["16.67 EUR", "16.66 EUR", "16.67 EUR"]
```

Negative amounts allocate symmetrically, so a refund splits exactly like the original charge.

### FX display

```ts
const price = Money.fromMajor('49.00', 'USD');

price.convert('INR', '83.2475').format('en-IN'); // "₹4,079.13"
price.convert('JPY', '151.37').format('ja-JP'); // "￥7,417"  (JPY has 0 decimals)
price.convert('KWD', '0.3071').format('en-US'); // "KWD 15.048" (KWD has 3 decimals)
```

The rate is "units of target currency per one unit of source currency", given as a decimal
string. Exponent differences (USD 2 to JPY 0) are handled for you.

### Storing and sending amounts

```ts
JSON.stringify(price); // '{"minor":"4900","currency":"USD","exponent":2}'
Money.fromJSON({ minor: '4900', currency: 'USD', exponent: 2 }).equals(price); // true
```

`minor` is a string because JSON numbers lose precision above 2^53. In a database, store the
minor amount in an integer column (`BIGINT` or `NUMERIC`) plus the currency code.

### Mistakes it catches

```ts
Money.fromMajor('1.005', 'USD');
// PrecisionError: 1.005 has more than 2 decimal places for USD; pass { rounding }
Money.fromMajor('1.005', 'USD', { rounding: 'HALF_UP' }); // 1.01 USD

price.add(Money.of(100, 'INR'));
// CurrencyMismatchError: Currency mismatch: USD/2 vs INR/2

Money.of(12.5, 'USD'); // RangeError: Minor units must be a bigint or a safe integer, got 12.5 ...
```

## Rounding modes

| Mode        | 2.5 | 3.5 | -2.5 | 2.6 | 2.4 | Typical use                                   |
| ----------- | --- | --- | ---- | --- | --- | --------------------------------------------- |
| `HALF_EVEN` | 2   | 4   | -2   | 3   | 2   | Default. No upward bias over many operations. |
| `HALF_UP`   | 3   | 4   | -3   | 3   | 2   | Retail and tax rules ("round half up").       |
| `HALF_DOWN` | 2   | 3   | -2   | 3   | 2   | Rare; ties toward zero.                       |
| `FLOOR`     | 2   | 3   | -3   | 2   | 2   | Never overcharge.                             |
| `CEIL`      | 3   | 4   | -2   | 3   | 3   | Never undercharge (e.g. fees).                |
| `TRUNC`     | 2   | 3   | -2   | 2   | 2   | Drop the fraction.                            |

`HALF_UP` here means "ties away from zero" (-2.5 becomes -3). Check your jurisdiction's tax rules:
some require rounding per line, others on the invoice total.

## API

### Creating

| Method                                                       | Notes                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| `Money.of(minor, currency, { exponent? })`                   | `minor` is a `bigint` or a safe integer.                   |
| `Money.fromMajor(value, currency, { rounding?, exponent? })` | `value` is a decimal string (preferred), number or bigint. |
| `Money.zero(currency)`                                       |                                                            |
| `Money.fromJSON(json)`                                       | Inverse of `toJSON()`.                                     |
| `Money.sum(list, currency?)`                                 | `currency` is needed only for an empty list.               |
| `Money.min(...)` / `Money.max(...)` / `Money.isMoney(x)`     |                                                            |

Currency codes are case-insensitive and stored upper-case. Codes outside ISO 4217 (points, crypto)
need an explicit exponent: `Money.of(1, 'BTC', { exponent: 8 })`.

### Arithmetic (returns new `Money`)

| Method                               | Notes                                           |
| ------------------------------------ | ----------------------------------------------- |
| `add(m)`, `subtract(m)`              | Same currency required.                         |
| `negate()`, `abs()`                  |                                                 |
| `multiply(factor, rounding?)`        | `factor`: `'1.075'`, `3`, `5n` or `[num, den]`. |
| `divide(divisor, rounding?)`         | Throws `RangeError` on zero.                    |
| `percentage(percent, rounding?)`     | `percentage('18')` is 18%.                      |
| `allocate(ratios)`                   | Parts sum exactly to the original. Ratios >= 0. |
| `split(n)`                           | `allocate` with `n` equal ratios.               |
| `convert(currency, rate, rounding?)` | `rate` = target units per one source unit.      |

Default rounding is `HALF_EVEN`.

### Comparing

`compare(m)` (-1, 0, 1), `equals`, `lessThan`, `lessThanOrEqual`, `greaterThan`,
`greaterThanOrEqual`, `isZero`, `isPositive`, `isNegative`, `hasSameCurrency`.

### Output

| Method                            | Example                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `minor` / `currency` / `exponent` | `1999n`, `'USD'`, `2`                                    |
| `toMajorString()`                 | `'19.99'` (exact, any size)                              |
| `format(locales?, options?)`      | `'$19.99'`; `options` are passed to `Intl.NumberFormat`. |
| `toString()`                      | `'19.99 USD'`                                            |
| `toJSON()`                        | `{ minor: '1999', currency: 'USD', exponent: 2 }`        |
| `toNumber()`                      | Minor units as a number; throws above 2^53.              |

### Other exports

`CURRENCY_EXPONENTS`, `currencyExponent(code)`, `ROUNDING_MODES`, `DEFAULT_ROUNDING`,
`divRound(num, den, mode)`, `parseDecimal(str)`, `toRational(value)`, and the errors
`CurrencyMismatchError`, `UnknownCurrencyError`, `PrecisionError`.

## Notes

- **Numbers as input.** A number is read through its shortest string form, so `0.1` means exactly
  one tenth. Results of float arithmetic (`0.1 + 0.2`) keep their error and will throw
  `PrecisionError` in `fromMajor` unless you pass `rounding`. Prefer strings.
- **Formatting very large amounts.** `format()` passes an exact decimal string to
  `Intl.NumberFormat`. Node 19+ formats it exactly; Node 18 converts it to a number first, which is
  exact up to about 90 trillion dollars (2^53 minor units).
- **Exchange rates** are your input; this library doesn't fetch them.

## Development

```sh
npm install
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build
```

## License

MIT © 2026 Gratus Antin George
