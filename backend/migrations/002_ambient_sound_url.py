"""
Migration 002: rename ambient_sound.file_id → url

Run once against your Supabase DB via psql or the Supabase SQL editor:

  ALTER TABLE ambient_sound
    RENAME COLUMN file_id TO url;

  ALTER TABLE ambient_sound
    ALTER COLUMN url TYPE VARCHAR(1000);

SQLAlchemy's create_all() handles NEW tables automatically, but column
renames must be done manually (or with Alembic).  This script does it
programmatically using raw SQL so you can run it as a one-off migration.
"""
from app.db.session import engine
from sqlalchemy import text

def run():
    with engine.connect() as conn:
        # Check if old column still exists before trying to rename
        result = conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='ambient_sound' AND column_name='file_id'"
        ))
        if result.fetchone():
            conn.execute(text(
                "ALTER TABLE ambient_sound RENAME COLUMN file_id TO url"
            ))
            conn.execute(text(
                "ALTER TABLE ambient_sound ALTER COLUMN url TYPE VARCHAR(1000)"
            ))
            conn.commit()
            print("✅ Migration 002 applied: file_id → url")
        else:
            print("ℹ️  Migration 002 already applied (column 'url' exists)")

if __name__ == "__main__":
    run()
