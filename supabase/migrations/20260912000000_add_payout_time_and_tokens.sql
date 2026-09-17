/*
# Extend tokentrack_payouts with time-of-day and an optional token figure

## Purpose
The Payouts feature now records the time a payout was made (alongside the
existing date) and, optionally, a token figure for platforms where the
operator knows the exact tokens cashed out. Both are nullable additions —
no existing row is touched, no column is renamed or dropped, and every
existing payout keeps working exactly as before with these new fields
simply reading as null.

## Changes
### `tokentrack_payouts`
- `time` (text, nullable) — HH:mm 24h, same convention as
  `tokentrack_entries.start_time` / `end_time`.
- `tokens_amount` (numeric, nullable) — tokens associated with this payout,
  entered manually. Left null when the operator doesn't have a clean token
  figure for this platform's payout (e.g. BongaCams). No conversion rule is
  applied here — that is intentionally left for later, platform-specific work.
*/

ALTER TABLE tokentrack_payouts
  ADD COLUMN IF NOT EXISTS time text,
  ADD COLUMN IF NOT EXISTS tokens_amount numeric;
