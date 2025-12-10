"""
SQLModel database models for the Catalog Service.
"""
import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import field_validator
from sqlalchemy import Column, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlmodel import Field, Relationship, SQLModel


# ============================================================================
# Enums
# ============================================================================

class WorkspaceStatus(str, Enum):
    """Status states for a workspace instance."""
    PROVISIONING = "PROVISIONING"
    RUNNING = "RUNNING"
    DESTROYING = "DESTROYING"
    FAILED = "FAILED"
    DESTROYED = "DESTROYED"


class BuildStatus(str, Enum):
    """Build status for application images."""
    NOT_BUILT = "NOT_BUILT"
    BUILDING = "BUILDING"
    BUILT = "BUILT"
    FAILED = "FAILED"


class ComponentType(str, Enum):
    """Types of application components."""
    FRONTEND = "frontend"
    BACKEND = "backend"
    WORKER = "worker"
    DATABASE = "database"


# ============================================================================
# Pydantic Schemas (for API request/response)
# ============================================================================

class ComponentSchema(SQLModel):
    """Schema for a single component in the app manifest."""
    name: str
    type: ComponentType
    path: str
    port: int = Field(ge=1, le=65535)


class ManifestSchema(SQLModel):
    """Schema for the app-manifest.json file."""
    appName: str
    description: str
    components: list[ComponentSchema]
    
    @field_validator("appName")
    @classmethod
    def validate_app_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("appName cannot be empty")
        return v.strip()


class AppCatalogCreate(SQLModel):
    """Schema for creating an AppCatalog entry."""
    slug: str
    repo_path: str
    manifest_payload: dict[str, Any]


class AppCatalogRead(SQLModel):
    """Schema for reading an AppCatalog entry."""
    id: uuid.UUID
    slug: str
    repo_path: str
    manifest_payload: dict[str, Any]
    is_active: bool
    build_status: str  # BuildStatus enum value
    created_at: datetime
    updated_at: datetime


class WorkspaceInstanceCreate(SQLModel):
    """Schema for creating a workspace instance."""
    slug: str


class WorkspaceInstanceRead(SQLModel):
    """Schema for reading a workspace instance."""
    id: uuid.UUID
    catalog_id: uuid.UUID
    status: WorkspaceStatus
    access_url: Optional[str]
    created_at: datetime
    updated_at: datetime


# ============================================================================
# Database Models
# ============================================================================

class AppCatalog(SQLModel, table=True):
    """
    Database model representing an application in the catalog.
    
    This is synced from the app-manifest.json files in the apps directory.
    """
    __tablename__ = "app_catalog"
    __table_args__ = (
        Index("idx_app_catalog_slug", "slug", unique=True),
        Index("idx_app_catalog_is_active", "is_active"),
    )
    
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(
            PG_UUID(as_uuid=True),
            primary_key=True,
            server_default=text("gen_random_uuid()"),
        ),
    )
    
    slug: str = Field(
        max_length=255,
        nullable=False,
        description="Unique slug derived from manifest appName",
    )
    
    repo_path: str = Field(
        max_length=1024,
        nullable=False,
        description="Absolute path to the application folder",
    )
    
    manifest_payload: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False),
        description="Complete app-manifest.json contents",
    )
    
    is_active: bool = Field(
        default=True,
        nullable=False,
        description="Whether the app is currently active/valid",
    )
    
    build_status: str = Field(
        default="NOT_BUILT",
        max_length=50,
        nullable=False,
        description="Build status of Docker images (NOT_BUILT, BUILDING, BUILT, FAILED)",
    )
    
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        nullable=False,
    )
    
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        nullable=False,
    )
    
    # Relationships
    workspaces: list["WorkspaceInstance"] = Relationship(back_populates="catalog")


class WorkspaceInstance(SQLModel, table=True):
    """
    Database model representing a provisioned workspace instance.
    
    Created when a user requests to spin up an application.
    """
    __tablename__ = "workspace_instance"
    __table_args__ = (
        Index("idx_workspace_instance_catalog_id", "catalog_id"),
        Index("idx_workspace_instance_status", "status"),
    )
    
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(
            PG_UUID(as_uuid=True),
            primary_key=True,
            server_default=text("gen_random_uuid()"),
        ),
    )
    
    catalog_id: uuid.UUID = Field(
        sa_column=Column(
            PG_UUID(as_uuid=True),
            ForeignKey("app_catalog.id"),
            nullable=False,
        ),
        description="Reference to the AppCatalog entry",
    )
    
    status: WorkspaceStatus = Field(
        default=WorkspaceStatus.PROVISIONING,
        nullable=False,
        description="Current status of the workspace",
    )
    
    access_url: Optional[str] = Field(
        default=None,
        max_length=2048,
        nullable=True,
        description="URL to access the running workspace",
    )
    
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        nullable=False,
    )
    
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        nullable=False,
    )
    
    # Relationships
    catalog: Optional[AppCatalog] = Relationship(back_populates="workspaces")

