"""Add UserQuizCompletion table to track quiz attempts and prevent XP farming

Revision ID: 003
Revises: 002_book_purchase
Create Date: 2024-12-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime

# revision identifiers, used by Alembic.
revision = '003'
down_revision = '002_book_purchase'
branch_labels = None
depends_on = None


def upgrade():
    """Create user_quiz_completion table to track first-time quiz completions."""
    op.create_table(
        'user_quiz_completion',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('quiz_id', sa.Integer(), nullable=False),
        sa.Column('telegram_id', sa.Integer(), nullable=False),
        sa.Column('score', sa.Integer(), nullable=False),
        sa.Column('total', sa.Integer(), nullable=False),
        sa.Column('percentage', sa.Float(), nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['quiz_id'], ['quiz.id'], ),
        sa.UniqueConstraint('telegram_id', 'quiz_id', name='uq_user_quiz_completion'),
        
        sa.Index('ix_user_quiz_completion_user_id'),
        sa.Index('ix_user_quiz_completion_quiz_id'),
        sa.Index('ix_user_quiz_completion_telegram_id'),
    )


def downgrade():
    """Drop user_quiz_completion table."""
    op.drop_table('user_quiz_completion')
