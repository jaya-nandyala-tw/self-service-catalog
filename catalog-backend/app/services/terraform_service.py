"""
Terraform service for provisioning workspaces.

This service handles the async provisioning of workspace instances using Terraform.
Currently implements a mock version; real Terraform execution will be added later.
"""
import asyncio
import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models import WorkspaceInstance, WorkspaceStatus

logger = logging.getLogger(__name__)

# Mock configuration
MOCK_PROVISIONING_DELAY_SECONDS = 5
MOCK_ACCESS_URL_TEMPLATE = "http://localhost:{port}"


async def get_workspace_by_id(
    session: AsyncSession,
    workspace_id: uuid.UUID,
) -> WorkspaceInstance | None:
    """
    Retrieve a workspace instance by its ID.
    
    Args:
        session: Async database session
        workspace_id: UUID of the workspace
        
    Returns:
        WorkspaceInstance or None if not found
    """
    stmt = select(WorkspaceInstance).where(WorkspaceInstance.id == workspace_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def update_workspace_status(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    status: WorkspaceStatus,
    access_url: str | None = None,
) -> bool:
    """
    Update the status of a workspace instance.
    
    Args:
        session: Async database session
        workspace_id: UUID of the workspace
        status: New status to set
        access_url: Optional access URL (for RUNNING status)
        
    Returns:
        True if update was successful, False otherwise
    """
    workspace = await get_workspace_by_id(session, workspace_id)
    
    if not workspace:
        logger.error(f"Workspace not found: {workspace_id}")
        return False
    
    workspace.status = status
    workspace.updated_at = datetime.utcnow()
    
    if access_url:
        workspace.access_url = access_url
    
    session.add(workspace)
    await session.commit()
    
    logger.info(f"Updated workspace {workspace_id} status to: {status}")
    return True


def generate_access_url(manifest: dict[str, Any]) -> str:
    """
    Generate an access URL based on the manifest configuration.
    
    For now, uses the first component's port. Real implementation would
    use actual infrastructure details.
    
    Args:
        manifest: The app manifest payload
        
    Returns:
        Generated access URL string
    """
    components = manifest.get("components", [])
    
    if components:
        # Use the first component's port (typically frontend)
        first_port = components[0].get("port", 8080)
        return MOCK_ACCESS_URL_TEMPLATE.format(port=first_port)
    
    return MOCK_ACCESS_URL_TEMPLATE.format(port=8080)


async def run_terraform_init(workspace_id: uuid.UUID, manifest: dict[str, Any]) -> bool:
    """
    Mock Terraform init command.
    
    In a real implementation, this would:
    - Generate Terraform configuration from the manifest
    - Run `terraform init` in the appropriate directory
    
    Args:
        workspace_id: UUID of the workspace being provisioned
        manifest: The app manifest payload
        
    Returns:
        True if init was successful
    """
    logger.info(f"[MOCK] Running terraform init for workspace {workspace_id}")
    logger.debug(f"[MOCK] Manifest: {manifest.get('appName', 'unknown')}")
    
    # Simulate init delay
    await asyncio.sleep(1)
    
    return True


async def run_terraform_apply(workspace_id: uuid.UUID, manifest: dict[str, Any]) -> bool:
    """
    Mock Terraform apply command.
    
    In a real implementation, this would:
    - Run `terraform apply -auto-approve`
    - Parse the output for resource details
    - Extract access URLs and other metadata
    
    Args:
        workspace_id: UUID of the workspace being provisioned
        manifest: The app manifest payload
        
    Returns:
        True if apply was successful
    """
    logger.info(f"[MOCK] Running terraform apply for workspace {workspace_id}")
    
    # Log what would be provisioned
    app_name = manifest.get("appName", "unknown")
    components = manifest.get("components", [])
    
    logger.info(f"[MOCK] Provisioning app: {app_name}")
    for component in components:
        logger.info(
            f"[MOCK]   - Component: {component.get('name')} "
            f"(type: {component.get('type')}, port: {component.get('port')})"
        )
    
    # Simulate apply delay (main provisioning time)
    await asyncio.sleep(MOCK_PROVISIONING_DELAY_SECONDS - 1)
    
    return True


async def provision_workspace(workspace_id: uuid.UUID, manifest: dict[str, Any]) -> None:
    """
    Provision a workspace instance asynchronously.
    
    This is the main background task that handles the full provisioning flow:
    1. Runs terraform init
    2. Runs terraform apply
    3. Updates workspace status to RUNNING on success or FAILED on error
    
    Args:
        workspace_id: UUID of the workspace to provision
        manifest: The app manifest payload containing topology information
    """
    logger.info(f"Starting provisioning for workspace: {workspace_id}")
    
    try:
        # Use a fresh session for the background task
        async with async_session() as session:
            # Run terraform init
            init_success = await run_terraform_init(workspace_id, manifest)
            if not init_success:
                raise Exception("Terraform init failed")
            
            # Run terraform apply
            apply_success = await run_terraform_apply(workspace_id, manifest)
            if not apply_success:
                raise Exception("Terraform apply failed")
            
            # Generate access URL
            access_url = generate_access_url(manifest)
            
            # Update status to RUNNING
            await update_workspace_status(
                session=session,
                workspace_id=workspace_id,
                status=WorkspaceStatus.RUNNING,
                access_url=access_url,
            )
            
            logger.info(
                f"Successfully provisioned workspace {workspace_id}. "
                f"Access URL: {access_url}"
            )
            
    except Exception as e:
        logger.error(f"Failed to provision workspace {workspace_id}: {e}")
        
        # Update status to FAILED
        try:
            async with async_session() as session:
                await update_workspace_status(
                    session=session,
                    workspace_id=workspace_id,
                    status=WorkspaceStatus.FAILED,
                )
        except Exception as update_error:
            logger.error(
                f"Failed to update workspace status to FAILED: {update_error}"
            )


async def destroy_workspace(workspace_id: uuid.UUID) -> None:
    """
    Destroy a workspace instance asynchronously.
    
    This would run terraform destroy to tear down the infrastructure.
    Currently implements a mock version.
    
    Args:
        workspace_id: UUID of the workspace to destroy
    """
    logger.info(f"Starting destruction for workspace: {workspace_id}")
    
    try:
        # Simulate terraform destroy
        logger.info(f"[MOCK] Running terraform destroy for workspace {workspace_id}")
        await asyncio.sleep(3)
        
        # Update status to DESTROYED
        async with async_session() as session:
            await update_workspace_status(
                session=session,
                workspace_id=workspace_id,
                status=WorkspaceStatus.DESTROYED,
            )
            
        logger.info(f"Successfully destroyed workspace {workspace_id}")
        
    except Exception as e:
        logger.error(f"Failed to destroy workspace {workspace_id}: {e}")

