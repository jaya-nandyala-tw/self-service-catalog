"""
Workspaces API router.

Provides endpoints for managing workspace instances.
"""
import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import (
    AppCatalog,
    WorkspaceInstance,
    WorkspaceInstanceCreate,
    WorkspaceInstanceRead,
    WorkspaceStatus,
)
from app.services.terraform_service import destroy_workspace, provision_workspace

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])


async def get_catalog_by_slug(
    session: AsyncSession,
    slug: str,
) -> AppCatalog | None:
    """
    Retrieve a catalog entry by its slug.
    
    Args:
        session: Database session
        slug: The unique slug of the application
        
    Returns:
        AppCatalog entry or None
    """
    stmt = select(AppCatalog).where(
        AppCatalog.slug == slug,
        AppCatalog.is_active == True,  # noqa: E712
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


@router.post(
    "",
    response_model=WorkspaceInstanceRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new workspace",
    description=(
        "Creates a new workspace instance for the specified app. "
        "The provisioning happens asynchronously in the background."
    ),
)
async def create_workspace(
    workspace_request: WorkspaceInstanceCreate,
    background_tasks: BackgroundTasks,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> WorkspaceInstance:
    """
    Create a new workspace instance.
    
    This endpoint:
    1. Looks up the AppCatalog entry by slug
    2. Creates a new WorkspaceInstance with PROVISIONING status
    3. Triggers an async background task to run Terraform
    4. Returns the new workspace immediately
    
    Args:
        workspace_request: Request body containing the app slug
        background_tasks: FastAPI background tasks (injected)
        session: Database session (injected)
        
    Returns:
        The newly created WorkspaceInstance
        
    Raises:
        HTTPException: If the app slug is not found
    """
    logger.info(f"Creating workspace for app: {workspace_request.slug}")
    
    # Look up the catalog entry
    catalog_entry = await get_catalog_by_slug(session, workspace_request.slug)
    
    if not catalog_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"App with slug '{workspace_request.slug}' not found or inactive",
        )
    
    # Create the workspace instance
    workspace = WorkspaceInstance(
        catalog_id=catalog_entry.id,
        status=WorkspaceStatus.PROVISIONING,
    )
    
    session.add(workspace)
    await session.commit()
    await session.refresh(workspace)
    
    logger.info(f"Created workspace {workspace.id} for app {workspace_request.slug}")
    
    # Trigger provisioning in background
    background_tasks.add_task(
        provision_workspace,
        workspace.id,
        catalog_entry.manifest_payload,
    )
    
    logger.info(f"Background provisioning task queued for workspace {workspace.id}")
    
    return workspace


@router.get(
    "",
    response_model=list[WorkspaceInstanceRead],
    summary="List all workspaces",
    description="Returns a list of all workspace instances.",
)
async def list_workspaces(
    session: Annotated[AsyncSession, Depends(get_session)],
    status_filter: WorkspaceStatus | None = None,
) -> list[WorkspaceInstance]:
    """
    Get all workspace instances.
    
    Args:
        session: Database session (injected)
        status_filter: Optional filter by workspace status
        
    Returns:
        List of WorkspaceInstance entries
    """
    logger.info(f"Listing workspaces (status_filter={status_filter})")
    
    stmt = select(WorkspaceInstance)
    
    if status_filter:
        stmt = stmt.where(WorkspaceInstance.status == status_filter)
    
    stmt = stmt.order_by(WorkspaceInstance.created_at.desc())
    
    result = await session.execute(stmt)
    workspaces = result.scalars().all()
    
    logger.info(f"Found {len(workspaces)} workspaces")
    return list(workspaces)


@router.get(
    "/{workspace_id}",
    response_model=WorkspaceInstanceRead,
    summary="Get a workspace by ID",
    description="Returns a single workspace instance by its ID.",
)
async def get_workspace(
    workspace_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> WorkspaceInstance:
    """
    Get a single workspace by ID.
    
    Args:
        workspace_id: UUID of the workspace
        session: Database session (injected)
        
    Returns:
        WorkspaceInstance entry
        
    Raises:
        HTTPException: If the workspace is not found
    """
    logger.info(f"Fetching workspace: {workspace_id}")
    
    stmt = select(WorkspaceInstance).where(WorkspaceInstance.id == workspace_id)
    result = await session.execute(stmt)
    workspace = result.scalar_one_or_none()
    
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workspace with ID '{workspace_id}' not found",
        )
    
    return workspace


@router.delete(
    "/{workspace_id}",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Destroy a workspace",
    description=(
        "Initiates destruction of a workspace instance. "
        "The actual teardown happens asynchronously in the background."
    ),
)
async def delete_workspace(
    workspace_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """
    Delete (destroy) a workspace instance.
    
    This endpoint:
    1. Looks up the workspace by ID
    2. Triggers an async background task to run Terraform destroy
    3. Returns immediately
    
    Args:
        workspace_id: UUID of the workspace to destroy
        background_tasks: FastAPI background tasks (injected)
        session: Database session (injected)
        
    Returns:
        Confirmation message
        
    Raises:
        HTTPException: If the workspace is not found
    """
    logger.info(f"Destroying workspace: {workspace_id}")
    
    # Verify workspace exists
    stmt = select(WorkspaceInstance).where(WorkspaceInstance.id == workspace_id)
    result = await session.execute(stmt)
    workspace = result.scalar_one_or_none()
    
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workspace with ID '{workspace_id}' not found",
        )
    
    if workspace.status == WorkspaceStatus.DESTROYED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workspace is already destroyed",
        )
    
    # Trigger destruction in background
    background_tasks.add_task(destroy_workspace, workspace_id)
    
    logger.info(f"Background destruction task queued for workspace {workspace_id}")
    
    return {
        "status": "accepted",
        "message": f"Workspace {workspace_id} destruction initiated",
        "workspace_id": str(workspace_id),
    }

