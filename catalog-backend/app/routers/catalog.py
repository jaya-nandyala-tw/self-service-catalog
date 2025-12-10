"""
Catalog API router.

Provides endpoints for listing and syncing the app catalog.
"""
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_session
from app.models import AppCatalog, AppCatalogRead
from app.services.scanner import ScanResult, sync_catalog

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/catalog", tags=["Catalog"])


@router.get(
    "",
    response_model=list[AppCatalogRead],
    summary="List all catalog entries",
    description="Returns a list of all valid and active applications in the catalog.",
)
async def list_catalog(
    session: Annotated[AsyncSession, Depends(get_session)],
    active_only: bool = True,
) -> list[AppCatalog]:
    """
    Get all applications from the catalog.
    
    Args:
        session: Database session (injected)
        active_only: If True, only return active apps (default: True)
        
    Returns:
        List of AppCatalog entries
    """
    logger.info(f"Listing catalog entries (active_only={active_only})")
    
    stmt = select(AppCatalog)
    
    if active_only:
        stmt = stmt.where(AppCatalog.is_active == True)  # noqa: E712
    
    stmt = stmt.order_by(AppCatalog.slug)
    
    result = await session.execute(stmt)
    apps = result.scalars().all()
    
    logger.info(f"Found {len(apps)} catalog entries")
    return list(apps)


@router.get(
    "/{slug}",
    response_model=AppCatalogRead,
    summary="Get a catalog entry by slug",
    description="Returns a single application from the catalog by its slug.",
)
async def get_catalog_entry(
    slug: str,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AppCatalog:
    """
    Get a single application from the catalog by slug.
    
    Args:
        slug: The unique slug of the application
        session: Database session (injected)
        
    Returns:
        AppCatalog entry
        
    Raises:
        HTTPException: If the app is not found
    """
    logger.info(f"Fetching catalog entry: {slug}")
    
    stmt = select(AppCatalog).where(AppCatalog.slug == slug)
    result = await session.execute(stmt)
    app = result.scalar_one_or_none()
    
    if not app:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"App with slug '{slug}' not found",
        )
    
    return app


@router.post(
    "/sync",
    response_model=dict,
    summary="Sync catalog from filesystem",
    description=(
        "Triggers a scan of the apps directory to discover and validate "
        "app manifests. Valid apps are upserted into the catalog database."
    ),
)
async def sync_catalog_endpoint(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """
    Trigger a catalog sync from the apps directory.
    
    This endpoint:
    1. Scans the configured apps directory
    2. Validates app-manifest.json files
    3. Verifies Dockerfiles exist for each component
    4. Upserts valid apps into the database
    5. Marks missing apps as inactive
    
    Args:
        session: Database session (injected)
        
    Returns:
        ScanResult with statistics and any errors
    """
    logger.info("Triggering catalog sync")
    
    apps_path = str(settings.apps_directory_path)
    logger.info(f"Apps directory: {apps_path}")
    
    try:
        result: ScanResult = await sync_catalog(apps_path, session)
        
        return {
            "status": "completed",
            "message": f"Scanned {result.scanned} apps, {result.valid} valid, {result.invalid} invalid",
            "details": result.to_dict(),
        }
        
    except Exception as e:
        logger.error(f"Catalog sync failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Catalog sync failed: {str(e)}",
        )

