-- supabase_allow_insert.sql
-- Two options to allow INSERTs into the public.health_metrics table for testing.
-- OPTION A (quick, testing): disable Row Level Security entirely
--   Run this in the Supabase SQL editor to allow inserts from any key.
--   Be sure to re-enable RLS after testing.

-- Disable RLS (testing only)
ALTER TABLE public.health_metrics DISABLE ROW LEVEL SECURITY;

-- OPTIONAL: when finished testing, re-enable RLS
-- ALTER TABLE public.health_metrics ENABLE ROW LEVEL SECURITY;

-- OPTION B (safer, temporary policy): allow INSERTs from the anon role
-- Use this if you want to keep RLS enabled but permit test inserts from the anon/public API key.
-- This grants INSERT permission to the 'anon' role only for testing; remove the policy afterwards.

CREATE POLICY allow_inserts_for_anon
ON public.health_metrics
FOR INSERT
TO anon
WITH CHECK (true);

-- To remove the policy after testing:
-- DROP POLICY IF EXISTS allow_inserts_for_anon ON public.health_metrics;

-- NOTE: INSERT policies only accept a `WITH CHECK` expression. Do not include a `USING` clause for INSERT.

-- NOTES:
-- - Run one option (A or B) at a time. Option A is quickest but disables RLS entirely.
-- - Option B keeps RLS enabled but opens INSERTs to the public anon key (use only in local/dev testing).
-- - For production, prefer creating policies that check auth claims or use the service_role key from your backend (service_role bypasses RLS when used server-side).
