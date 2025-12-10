"""Initial schema - AppCatalog and WorkspaceInstance tables

Revision ID: 001_initial
Revises: 
Create Date: 2024-12-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create app_catalog table
    op.create_table(
        'app_catalog',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('slug', sa.String(length=255), nullable=False),
        sa.Column('repo_path', sa.String(length=1024), nullable=False),
        sa.Column('manifest_payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    
    # Create indexes for app_catalog
    op.create_index('idx_app_catalog_slug', 'app_catalog', ['slug'], unique=True)
    op.create_index('idx_app_catalog_is_active', 'app_catalog', ['is_active'], unique=False)
    
    # Create workspace_instance table
    op.create_table(
        'workspace_instance',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('catalog_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, default='PROVISIONING'),
        sa.Column('access_url', sa.String(length=2048), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['catalog_id'], ['app_catalog.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    
    # Create indexes for workspace_instance
    op.create_index('idx_workspace_instance_catalog_id', 'workspace_instance', ['catalog_id'], unique=False)
    op.create_index('idx_workspace_instance_status', 'workspace_instance', ['status'], unique=False)


def downgrade() -> None:
    # Drop workspace_instance table and indexes
    op.drop_index('idx_workspace_instance_status', table_name='workspace_instance')
    op.drop_index('idx_workspace_instance_catalog_id', table_name='workspace_instance')
    op.drop_table('workspace_instance')
    
    # Drop app_catalog table and indexes
    op.drop_index('idx_app_catalog_is_active', table_name='app_catalog')
    op.drop_index('idx_app_catalog_slug', table_name='app_catalog')
    op.drop_table('app_catalog')

