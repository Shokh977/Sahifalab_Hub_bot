"""SAHIFALAB API Database Migrations

Revision ID: 001
Revises: 
Create Date: 2024-03-13 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    # Create tables
    op.create_table(
        'user',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('telegram_id', sa.Integer(), nullable=False, unique=True),
        sa.Column('username', sa.String(255), nullable=True, unique=True),
        sa.Column('first_name', sa.String(255), nullable=True),
        sa.Column('last_name', sa.String(255), nullable=True),
        sa.Column('email', sa.String(255), nullable=True, unique=True),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('ix_user_telegram_id'),
        sa.Index('ix_user_username'),
        sa.Index('ix_user_email'),
    )

    # Add other tables here...
    pass

def downgrade():
    op.drop_table('user')
    # Drop other tables here...
    pass
