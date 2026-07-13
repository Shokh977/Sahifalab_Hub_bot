-- 076_challenge_cover_image.sql — step-23: challenge cover images
--
-- Nullable: a challenge without an image must still render well (mobile
-- falls back to a color-gradient + icon watermark treatment).

ALTER TABLE challenges ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR(500);
