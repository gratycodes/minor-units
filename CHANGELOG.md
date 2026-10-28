# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-29

Not yet published to npm.

### Added

- `Money` value type: immutable, `bigint` minor units, currency code and exponent.
- Factories: `of`, `fromMajor` (exact decimal parsing, `PrecisionError` unless a rounding mode
  is given), `zero`, `fromJSON`, `sum`, `min`, `max`.
- ISO 4217 exponent table (0, 2, 3 and 4 decimal currencies) and custom codes with an explicit
  exponent.
- Arithmetic: `add`, `subtract`, `negate`, `abs`, `multiply`, `divide`, `percentage`, `convert`.
- Rounding modes: `HALF_EVEN` (default), `HALF_UP`, `HALF_DOWN`, `FLOOR`, `CEIL`, `TRUNC`.
- `allocate` (largest remainder method) and `split`, including negative amounts.
- Comparisons and `CurrencyMismatchError`.
- Output: `toMajorString`, `format` (Intl.NumberFormat), `toString`, `toJSON`, `toNumber`.
- Dual ESM/CJS build with type declarations; Node.js 18+; no runtime dependencies.
