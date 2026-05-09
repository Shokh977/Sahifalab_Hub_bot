-- 060_extend_level_cap_to_29.sql
-- Extends the XP level cap from 27 (Sohibqiron) to 29 (Zulqarnayn).
-- Updates calculate_level_from_xp() to allow levels 28 and 29.
-- Level 28 (Shahanshoh): requires 100 × 28^2.5 ≈ 416,869 XP
-- Level 29 (Zulqarnayn): requires 100 × 29^2.5 ≈ 452,548 XP

CREATE OR REPLACE FUNCTION calculate_level_from_xp(xp_input INT)
RETURNS INT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
lv INT := 1;
BEGIN
WHILE (100.0 * POWER((lv + 1)::FLOAT, 2.5)) <= xp_input::FLOAT LOOP
    lv := lv + 1;
    IF lv >= 29 THEN EXIT; END IF;
END LOOP;
RETURN lv;
END;
$$;
