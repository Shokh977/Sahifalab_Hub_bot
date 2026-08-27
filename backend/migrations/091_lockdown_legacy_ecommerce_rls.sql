-- Migration 091: Enable RLS on the unused legacy e-commerce table cluster
--
-- SECURITY FIX: Supabase's linter flagged public.order (and its siblings) as
-- exposed to PostgREST with RLS disabled. These tables (user, product, order,
-- order_item, cart, cart_items, address, notification, quote) come from a
-- generic shopping-cart scaffold in app/models/models.py that predates this
-- app's real features. They are created automatically by
-- Base.metadata.create_all() on every backend boot (app/db/session.py),
-- which is why they never went through a numbered migration with RLS — unlike
-- every real feature table in this app (see migration 046 for the same
-- lockdown pattern applied to the live tables).
--
-- Their REST router (app/api/v1/endpoints/orders.py) is never mounted in
-- main.py, so nothing in the app actually serves traffic through these
-- tables — this is a pure lockdown, not expected to change any behavior.
--
-- Pattern: enable RLS, grant service_role ALL (bypasses RLS anyway, kept for
-- parity with migration 046), deny anon everything by default.
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public."user"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.address        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legacy: service_role all" ON public."user"       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "legacy: service_role all" ON public.product      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "legacy: service_role all" ON public."order"      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "legacy: service_role all" ON public.order_item   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "legacy: service_role all" ON public.cart         FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "legacy: service_role all" ON public.cart_items   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "legacy: service_role all" ON public.address      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "legacy: service_role all" ON public.notification FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "legacy: service_role all" ON public.quote        FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "legacy: anon denied" ON public."user"       FOR SELECT TO anon USING (false);
CREATE POLICY "legacy: anon denied" ON public.product      FOR SELECT TO anon USING (false);
CREATE POLICY "legacy: anon denied" ON public."order"      FOR SELECT TO anon USING (false);
CREATE POLICY "legacy: anon denied" ON public.order_item   FOR SELECT TO anon USING (false);
CREATE POLICY "legacy: anon denied" ON public.cart         FOR SELECT TO anon USING (false);
CREATE POLICY "legacy: anon denied" ON public.cart_items   FOR SELECT TO anon USING (false);
CREATE POLICY "legacy: anon denied" ON public.address      FOR SELECT TO anon USING (false);
CREATE POLICY "legacy: anon denied" ON public.notification FOR SELECT TO anon USING (false);
CREATE POLICY "legacy: anon denied" ON public.quote        FOR SELECT TO anon USING (false);

COMMIT;
