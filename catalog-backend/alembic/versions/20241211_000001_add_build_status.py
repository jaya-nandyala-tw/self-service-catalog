"""Add build_status column to app_catalog

Revision ID: 003_add_build_status
Revises: 002_add_destroying
Create Date: 2024-12-11 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '003_add_build_status'
down_revision: Union[str, None] = '002_add_destroying'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add build_status column to app_catalog table.
    
    This column tracks whether Docker images have been pre-built for the app,
    allowing faster deployments by separating image building from workspace spinning.
    """
    # Add build_status column with default value
    op.add_column(
        'app_catalog',
        sa.Column(
            'build_status',
            sa.String(length=50),
            nullable=False,
            server_default='NOT_BUILT'
        )
    )


def downgrade() -> None:
    """Remove build_status column from app_catalog table."""
    op.drop_column('app_catalog', 'build_status')

