/*
# Restrict TokenTrack tables to authenticated users only

## Purpose
The app now has real Supabase email/password login. Before this migration,
every policy on tokentrack_platforms/tokentrack_entries/tokentrack_payouts
granted full select/insert/update/delete to the `anon` role — meaning
anyone with the deployed URL could read or write all data with no login
at all. That was fine while the app only ran on localhost; it is not fine
now that it has a public URL.

## Changes
Every existing policy is dropped and recreated identically except the
`anon` role is removed from the `TO` clause, leaving `TO authenticated`
only. No column, table, or data is touched — this only changes who is
allowed to read/write, not what's stored.
*/

-- ── Platforms ──────────────────────────────────────────────
DROP POLICY IF EXISTS "tt_platforms_select" ON tokentrack_platforms;
CREATE POLICY "tt_platforms_select" ON tokentrack_platforms FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "tt_platforms_insert" ON tokentrack_platforms;
CREATE POLICY "tt_platforms_insert" ON tokentrack_platforms FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "tt_platforms_update" ON tokentrack_platforms;
CREATE POLICY "tt_platforms_update" ON tokentrack_platforms FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tt_platforms_delete" ON tokentrack_platforms;
CREATE POLICY "tt_platforms_delete" ON tokentrack_platforms FOR DELETE
  TO authenticated USING (true);

-- ── Entries ────────────────────────────────────────────────
DROP POLICY IF EXISTS "tt_entries_select" ON tokentrack_entries;
CREATE POLICY "tt_entries_select" ON tokentrack_entries FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "tt_entries_insert" ON tokentrack_entries;
CREATE POLICY "tt_entries_insert" ON tokentrack_entries FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "tt_entries_update" ON tokentrack_entries;
CREATE POLICY "tt_entries_update" ON tokentrack_entries FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tt_entries_delete" ON tokentrack_entries;
CREATE POLICY "tt_entries_delete" ON tokentrack_entries FOR DELETE
  TO authenticated USING (true);

-- ── Payouts ────────────────────────────────────────────────
DROP POLICY IF EXISTS "tt_payouts_select" ON tokentrack_payouts;
CREATE POLICY "tt_payouts_select" ON tokentrack_payouts FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "tt_payouts_insert" ON tokentrack_payouts;
CREATE POLICY "tt_payouts_insert" ON tokentrack_payouts FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "tt_payouts_update" ON tokentrack_payouts;
CREATE POLICY "tt_payouts_update" ON tokentrack_payouts FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tt_payouts_delete" ON tokentrack_payouts;
CREATE POLICY "tt_payouts_delete" ON tokentrack_payouts FOR DELETE
  TO authenticated USING (true);
