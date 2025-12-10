"""Add DESTROYING status to workspace status enum

Revision ID: 002_add_destroying
Revises: 001_initial
Create Date: 2024-12-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '002_add_destroying'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add DESTROYING status to the workspacestatus enum.
    
    This status is used to indicate that a workspace is in the process
    of being torn down, providing better UX feedback to users.
    """
    # Add the new enum value after RUNNING
    # Note: PostgreSQL doesn't support IF NOT EXISTS for ADD VALUE in older versions,
    # so we use a try/except pattern via raw SQL with proper error handling
    op.execute("""
        DO $$
        BEGIN
            ALTER TYPE workspacestatus ADD VALUE IF NOT EXISTS 'DESTROYING' AFTER 'RUNNING';
        EXCEPTION
            WHEN duplicate_object THEN
                -- Value already exists, ignore
                NULL;
        END
        $$;
    """)


def downgrade() -> None:
    """Remove DESTROYING status from the workspacestatus enum.
    
    Note: PostgreSQL doesn't support removing enum values directly.
    To fully downgrade, you would need to:
    1. Create a new enum type without DESTROYING
    2. Update all columns to use the new type
    3. Drop the old type
    4. Rename the new type
    
    For simplicity, we just document this limitation.
    Any workspaces with DESTROYING status should be updated to DESTROYED first.
    """
    # Update any DESTROYING workspaces to DESTROYED before downgrade
    op.execute("""
        UPDATE workspace_instance 
        SET status = 'DESTROYED' 
        WHERE status = 'DESTROYING';
    """)
    
    # Note: Cannot remove enum values in PostgreSQL without recreating the type
    # This is intentionally left as a no-op for the enum itself
    pass

