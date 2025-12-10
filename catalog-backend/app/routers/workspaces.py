"""
Workspaces API router.

Provides endpoints for managing workspace instances.
"""
import asyncio
import logging
import subprocess
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import (
    AppCatalog,
    WorkspaceInstance,
    WorkspaceInstanceCreate,
    WorkspaceInstanceRead,
    WorkspaceStatus,
)
from app.services.terraform_service import (
    destroy_workspace,
    destroy_existing_workspace,
    provision_workspace,
    cleanup_local_access,
    stop_all_port_forwards,
    load_port_mappings,
    release_port,
    update_hosts_file,
)

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
        "Only one workspace per app is allowed - existing workspaces will be destroyed first. "
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
    2. Destroys any existing workspace for this app (only one allowed)
    3. Creates a new WorkspaceInstance with PROVISIONING status
    4. Triggers an async background task to run Terraform
    5. Returns the new workspace immediately
    
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
    
    # Check for existing workspace for this app and destroy it
    existing_stmt = select(WorkspaceInstance).where(
        WorkspaceInstance.catalog_id == catalog_entry.id,
        WorkspaceInstance.status != WorkspaceStatus.DESTROYED,
    )
    existing_result = await session.execute(existing_stmt)
    existing_workspaces = existing_result.scalars().all()
    
    for existing in existing_workspaces:
        logger.info(f"Destroying existing workspace {existing.id} for app {workspace_request.slug}")
        # Run destroy synchronously to ensure clean slate
        await destroy_existing_workspace(existing.id)
        # Mark as destroyed in DB
        existing.status = WorkspaceStatus.DESTROYED
        session.add(existing)
    
    if existing_workspaces:
        await session.commit()
        logger.info(f"Destroyed {len(existing_workspaces)} existing workspace(s) for app {workspace_request.slug}")
    
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
    
    if workspace.status == WorkspaceStatus.DESTROYING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workspace is already being destroyed",
        )
    
    # Update status to DESTROYING immediately
    workspace.status = WorkspaceStatus.DESTROYING
    workspace.updated_at = datetime.utcnow()
    session.add(workspace)
    await session.commit()
    
    logger.info(f"Set workspace {workspace_id} status to DESTROYING")
    
    # Trigger destruction in background
    background_tasks.add_task(destroy_workspace, workspace_id)
    
    logger.info(f"Background destruction task queued for workspace {workspace_id}")
    
    return {
        "status": "accepted",
        "message": f"Workspace {workspace_id} destruction initiated",
        "workspace_id": str(workspace_id),
    }


async def _destroy_all_background():
    """Background task to destroy all workspaces and reset catalog."""
    from pathlib import Path
    from app.database import async_session
    
    logger.info("Background DESTROY ALL task started")
    
    destroyed_namespaces = []
    errors = []
    
    try:
        # Step 1: Get all workspace namespaces from Kubernetes
        result = subprocess.run(
            ["kubectl", "get", "namespaces", "-o", "jsonpath={.items[*].metadata.name}"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        
        if result.returncode == 0:
            namespaces = result.stdout.split()
            ws_namespaces = [ns for ns in namespaces if ns.startswith("ws-")]
            
            # Delete each workspace namespace (with --wait=false for faster deletion)
            for ns in ws_namespaces:
                logger.info(f"Deleting namespace: {ns}")
                delete_result = subprocess.run(
                    ["kubectl", "delete", "namespace", ns, "--ignore-not-found", "--wait=false"],
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
                if delete_result.returncode == 0:
                    destroyed_namespaces.append(ns)
                else:
                    errors.append(f"Failed to delete namespace {ns}: {delete_result.stderr}")
        else:
            errors.append(f"Failed to list namespaces: {result.stderr}")
            
    except subprocess.TimeoutExpired:
        errors.append("Kubernetes namespace deletion timed out")
    except Exception as e:
        errors.append(f"Kubernetes error: {str(e)}")
    
    # Step 2: Truncate database tables
    try:
        async with async_session() as session:
            # Delete all workspace instances
            await session.execute(delete(WorkspaceInstance))
            
            # Delete all catalog entries
            await session.execute(delete(AppCatalog))
            
            await session.commit()
            logger.info("Database tables truncated successfully")
        
    except Exception as e:
        errors.append(f"Database error: {str(e)}")
    
    # Step 3: Clean up port-forwards
    try:
        stop_all_port_forwards()
        logger.info("Port-forwards stopped")
    except Exception as e:
        errors.append(f"Port-forward cleanup error: {str(e)}")
    
    # Step 4: Clean up Terraform workspaces and state
    try:
        tf_path = Path(__file__).parent.parent.parent.parent / "infrastructure" / "terraform" / "app-deployer"
        
        # First, delete all Terraform workspaces (except default)
        # Switch to default workspace first
        subprocess.run(
            ["terraform", "workspace", "select", "default"],
            cwd=tf_path,
            capture_output=True,
            text=True,
            timeout=30,
        )
        
        # List all workspaces
        list_result = subprocess.run(
            ["terraform", "workspace", "list"],
            cwd=tf_path,
            capture_output=True,
            text=True,
            timeout=30,
        )
        
        if list_result.returncode == 0:
            # Parse workspace names (format: "  workspace" or "* workspace")
            workspaces = [
                ws.strip().lstrip("* ").strip() 
                for ws in list_result.stdout.strip().split("\n") 
                if ws.strip() and ws.strip().lstrip("* ").strip() != "default"
            ]
            
            # Delete each non-default workspace
            for ws in workspaces:
                logger.info(f"Deleting Terraform workspace: {ws}")
                subprocess.run(
                    ["terraform", "workspace", "delete", "-force", ws],
                    cwd=tf_path,
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
        
        # Remove terraform state files (default workspace)
        state_file = tf_path / "terraform.tfstate"
        backup_file = tf_path / "terraform.tfstate.backup"
        
        if state_file.exists():
            state_file.unlink()
        if backup_file.exists():
            backup_file.unlink()
        
        # Remove workspace state directory
        tf_state_dir = tf_path / "terraform.tfstate.d"
        if tf_state_dir.exists():
            import shutil
            shutil.rmtree(tf_state_dir)
            logger.info("Removed terraform.tfstate.d directory")
            
        # Remove any workspace-specific tfvars
        for tfvars in tf_path.glob("workspace-*.tfvars"):
            tfvars.unlink()
        
        # Remove port mappings file
        port_mappings_file = Path(__file__).parent.parent.parent / "port_mappings.json"
        if port_mappings_file.exists():
            port_mappings_file.unlink()
            
        logger.info("Terraform workspaces, state, and port mappings cleaned up")
        
    except Exception as e:
        errors.append(f"Terraform cleanup error: {str(e)}")
    
    logger.warning(f"DESTROY ALL complete - {len(destroyed_namespaces)} namespaces destroyed, {len(errors)} errors")


@router.delete(
    "",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Destroy all workspaces and reset catalog",
    description=(
        "Destroys all Kubernetes namespaces starting with 'ws-', "
        "truncates all catalog tables, and resets the system to a clean state. "
        "Runs asynchronously in the background. USE WITH CAUTION!"
    ),
)
async def destroy_all(
    background_tasks: BackgroundTasks,
    confirm: bool = False,
) -> dict:
    """
    Destroy all workspaces and reset the catalog database.
    
    This endpoint immediately returns 202 Accepted and runs destruction in background.
    
    Args:
        background_tasks: FastAPI background tasks (injected)
        confirm: Must be True to proceed (safety check)
        
    Returns:
        Acknowledgment that destruction has been initiated
        
    Raises:
        HTTPException: If confirm is not True
    """
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must set confirm=true to proceed with destruction",
        )
    
    logger.warning("DESTROY ALL initiated - queueing background task")
    
    # Queue the destruction task
    background_tasks.add_task(_destroy_all_background)
    
    return {
        "status": "accepted",
        "message": "Destruction initiated - running in background. Refresh the page in a few seconds.",
    }

