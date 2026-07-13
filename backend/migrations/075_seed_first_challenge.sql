-- 075_seed_first_challenge.sql
-- Seeds "20 Soat Fokus Marafoni" so Musobaqalar doesn't launch empty
-- (step-21 Phase 4). Official, featured, free to join.
--
-- Note: this is a direct SQL insert, not created through the admin API, so
-- it does NOT trigger the "announce a new featured challenge" push
-- broadcast (that only fires from POST /api/admin/challenges). Send an
-- announcement manually later if you want one, or just let it be
-- discovered via the Marra tab / dashboard card.

INSERT INTO challenges (
    slug, title, description, metric, target_value,
    starts_at, ends_at, join_deadline,
    is_official, created_by, is_private, max_participants,
    reward_xp, badge_key, color, icon, is_featured, status
) VALUES (
    '20-soat-fokus-marafoni',
    '20 Soat Fokus Marafoni',
    '30 kun ichida 20 soat fokus taymer orqali o''qing. Faqat fokus taymer vaqti hisoblanadi.',
    'focus_minutes', 1200,
    NOW(), NOW() + INTERVAL '30 days', NULL,
    TRUE, NULL, FALSE, NULL,
    500, 'marafonchi', '#F5A623', 'timer', TRUE, 'active'
)
ON CONFLICT (slug) DO NOTHING;
