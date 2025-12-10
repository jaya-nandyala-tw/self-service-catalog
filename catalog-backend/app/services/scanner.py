"""
Scanner service for discovering and validating app manifests.

This service scans the apps directory, validates manifests against the schema,
verifies that Dockerfiles exist for each component, and syncs to the database.
"""
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from pydantic import ValidationError
from slugify import slugify
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppCatalog, ManifestSchema

logger = logging.getLogger(__name__)

# Constants
MANIFEST_FILENAME = "app-manifest.json"
DOCKERFILE_NAME = "Dockerfile"


class ScanResult:
    """Result of scanning the apps directory."""
    
    def __init__(self):
        self.scanned: int = 0
        self.valid: int = 0
        self.invalid: int = 0
        self.errors: list[dict] = []
        self.synced_apps: list[str] = []
    
    def to_dict(self) -> dict:
        return {
            "scanned": self.scanned,
            "valid": self.valid,
            "invalid": self.invalid,
            "errors": self.errors,
            "synced_apps": self.synced_apps,
        }


def validate_manifest(manifest_path: Path) -> tuple[Optional[ManifestSchema], Optional[str]]:
    """
    Validate and parse an app-manifest.json file.
    
    Args:
        manifest_path: Path to the manifest file
        
    Returns:
        Tuple of (parsed_manifest, error_message)
    """
    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            raw_data = json.load(f)
        
        # Validate against schema
        manifest = ManifestSchema.model_validate(raw_data)
        return manifest, None
        
    except json.JSONDecodeError as e:
        return None, f"Invalid JSON: {e}"
    except ValidationError as e:
        return None, f"Schema validation failed: {e}"
    except Exception as e:
        return None, f"Failed to read manifest: {e}"


def validate_dockerfiles(app_root: Path, manifest: ManifestSchema) -> list[str]:
    """
    Verify that Dockerfiles exist for all components in the manifest.
    
    Args:
        app_root: Root directory of the application
        manifest: Parsed manifest schema
        
    Returns:
        List of error messages for missing Dockerfiles
    """
    errors = []
    
    for component in manifest.components:
        # Resolve the component path relative to app root
        component_path = (app_root / component.path).resolve()
        dockerfile_path = component_path / DOCKERFILE_NAME
        
        if not dockerfile_path.exists():
            errors.append(
                f"Component '{component.name}' missing Dockerfile at: {dockerfile_path}"
            )
        elif not dockerfile_path.is_file():
            errors.append(
                f"Component '{component.name}' Dockerfile path is not a file: {dockerfile_path}"
            )
    
    return errors


async def upsert_app_catalog(
    session: AsyncSession,
    slug: str,
    repo_path: str,
    manifest_payload: dict,
) -> AppCatalog:
    """
    Insert or update an AppCatalog entry.
    
    Args:
        session: Async database session
        slug: Unique slug for the app
        repo_path: Absolute path to the app directory
        manifest_payload: Raw manifest JSON data
        
    Returns:
        The created or updated AppCatalog entry
    """
    # Check if entry exists
    stmt = select(AppCatalog).where(AppCatalog.slug == slug)
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()
    
    if existing:
        # Update existing entry
        existing.repo_path = repo_path
        existing.manifest_payload = manifest_payload
        existing.is_active = True
        existing.updated_at = datetime.utcnow()
        session.add(existing)
        logger.info(f"Updated AppCatalog entry: {slug}")
        return existing
    else:
        # Create new entry
        new_entry = AppCatalog(
            slug=slug,
            repo_path=repo_path,
            manifest_payload=manifest_payload,
            is_active=True,
        )
        session.add(new_entry)
        logger.info(f"Created new AppCatalog entry: {slug}")
        return new_entry


async def deactivate_missing_apps(
    session: AsyncSession,
    found_slugs: set[str],
) -> int:
    """
    Mark apps as inactive if they no longer exist in the apps directory.
    
    Args:
        session: Async database session
        found_slugs: Set of slugs found during the current scan
        
    Returns:
        Number of apps deactivated
    """
    stmt = select(AppCatalog).where(
        AppCatalog.is_active == True,  # noqa: E712
        AppCatalog.slug.notin_(found_slugs) if found_slugs else True,
    )
    result = await session.execute(stmt)
    apps_to_deactivate = result.scalars().all()
    
    count = 0
    for app in apps_to_deactivate:
        app.is_active = False
        app.updated_at = datetime.utcnow()
        session.add(app)
        count += 1
        logger.info(f"Deactivated AppCatalog entry: {app.slug}")
    
    return count


async def sync_catalog(apps_dir_path: str, session: AsyncSession) -> ScanResult:
    """
    Scan the apps directory and sync valid manifests to the database.
    
    This function:
    1. Iterates through subdirectories of apps_dir_path
    2. Looks for app-manifest.json in each subdirectory
    3. Validates the manifest JSON against the schema
    4. Verifies that Dockerfiles exist for each component
    5. Upserts valid apps into the AppCatalog table
    6. Marks apps as inactive if they no longer exist
    
    Args:
        apps_dir_path: Path to the apps directory
        session: Async database session
        
    Returns:
        ScanResult with statistics and any errors encountered
    """
    result = ScanResult()
    apps_dir = Path(apps_dir_path).resolve()
    found_slugs: set[str] = set()
    
    logger.info(f"Starting catalog sync from: {apps_dir}")
    
    # Check if apps directory exists
    if not apps_dir.exists():
        result.errors.append({
            "path": str(apps_dir),
            "error": "Apps directory does not exist",
        })
        logger.error(f"Apps directory does not exist: {apps_dir}")
        return result
    
    if not apps_dir.is_dir():
        result.errors.append({
            "path": str(apps_dir),
            "error": "Apps path is not a directory",
        })
        logger.error(f"Apps path is not a directory: {apps_dir}")
        return result
    
    # Iterate through subdirectories
    for app_folder in apps_dir.iterdir():
        if not app_folder.is_dir():
            continue
        
        # Skip hidden directories
        if app_folder.name.startswith("."):
            continue
        
        result.scanned += 1
        manifest_path = app_folder / MANIFEST_FILENAME
        
        # Check if manifest exists
        if not manifest_path.exists():
            result.invalid += 1
            result.errors.append({
                "path": str(app_folder),
                "error": f"Missing {MANIFEST_FILENAME}",
            })
            logger.warning(f"Missing manifest in: {app_folder}")
            continue
        
        # Validate manifest
        manifest, parse_error = validate_manifest(manifest_path)
        if parse_error:
            result.invalid += 1
            result.errors.append({
                "path": str(manifest_path),
                "error": parse_error,
            })
            logger.warning(f"Invalid manifest in {app_folder}: {parse_error}")
            continue
        
        # Validate Dockerfiles
        dockerfile_errors = validate_dockerfiles(app_folder, manifest)
        if dockerfile_errors:
            result.invalid += 1
            result.errors.append({
                "path": str(app_folder),
                "error": "Missing Dockerfiles",
                "details": dockerfile_errors,
            })
            logger.warning(f"Missing Dockerfiles in {app_folder}: {dockerfile_errors}")
            continue
        
        # All validations passed - sync to database
        slug = slugify(manifest.appName)
        found_slugs.add(slug)
        
        # Read raw manifest for storage
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest_payload = json.load(f)
        
        await upsert_app_catalog(
            session=session,
            slug=slug,
            repo_path=str(app_folder.resolve()),
            manifest_payload=manifest_payload,
        )
        
        result.valid += 1
        result.synced_apps.append(slug)
        logger.info(f"Successfully synced app: {slug}")
    
    # Deactivate apps that no longer exist
    deactivated_count = await deactivate_missing_apps(session, found_slugs)
    if deactivated_count > 0:
        logger.info(f"Deactivated {deactivated_count} apps that no longer exist")
    
    # Commit all changes
    await session.commit()
    
    logger.info(
        f"Catalog sync complete. Scanned: {result.scanned}, "
        f"Valid: {result.valid}, Invalid: {result.invalid}"
    )
    
    return result

