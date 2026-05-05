-- Group chats tied to courses
CREATE TABLE IF NOT EXISTS group_chats (
    id          SERIAL PRIMARY KEY,
    course_id   INT         NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    cover_url   TEXT,
    created_by  BIGINT      NOT NULL,   -- teacher telegram_id
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (course_id)                  -- one group per course
);

CREATE INDEX IF NOT EXISTS idx_group_chats_course ON group_chats(course_id);

-- Members of each group
CREATE TABLE IF NOT EXISTS group_members (
    group_id    INT     NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
    user_id     BIGINT  NOT NULL,
    role        VARCHAR(20) NOT NULL DEFAULT 'member',  -- 'admin' | 'member'
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);

-- Messages inside groups
CREATE TABLE IF NOT EXISTS group_messages (
    id          BIGSERIAL   PRIMARY KEY,
    group_id    INT         NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
    sender_id   BIGINT      NOT NULL,
    content     TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group_time
    ON group_messages(group_id, created_at DESC);

-- Auto-add enrolled students when a group already exists for their course.
-- This trigger fires on every new course_enrollments row.
CREATE OR REPLACE FUNCTION auto_add_to_course_group()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO group_members (group_id, user_id, role)
    SELECT g.id, NEW.student_id, 'member'
    FROM   group_chats g
    WHERE  g.course_id = NEW.course_id
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_group_member ON course_enrollments;
CREATE TRIGGER trg_auto_group_member
    AFTER INSERT ON course_enrollments
    FOR EACH ROW EXECUTE FUNCTION auto_add_to_course_group();
