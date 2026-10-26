-- 109_pro_prices.sql — set the Sahifalab Pro launch prices.
--
-- 107 seeds pro_plans with ON CONFLICT DO NOTHING, so a database that got
-- an earlier seed (29 000 / 69 000 / 199 000) kept it. This upserts the
-- launch prices and the regular prices shown crossed out beside them.
-- Prices in so'm, by months. Safe to re-run.

INSERT INTO app_config (key, value, description) VALUES
  ('pro_plans', '{"1": 6900, "3": 17000, "12": 70000}',
   'Sahifalab Pro one-time pass prices in so''m, by months (1 / 3 / 12)'),
  ('pro_list_prices', '{"1": 9900, "3": 29700, "12": 118800}',
   'Sahifalab Pro regular prices in so''m, shown crossed out next to pro_plans')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
