"""
Terraform service for provisioning workspaces.

This service handles the async provisioning of workspace instances using Terraform.
Integrates with the universal-app Helm chart via the app-deployer Terraform module.
Also manages local DNS entries and port-forwarding for development.
"""
import asyncio
import json
import logging
import os
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models import AppCatalog, BuildStatus, WorkspaceInstance, WorkspaceStatus

logger = logging.getLogger(__name__)

# Terraform configuration
TERRAFORM_MODULE_PATH = Path(__file__).parent.parent.parent.parent / "infrastructure" / "terraform" / "app-deployer"
TERRAFORM_TIMEOUT_SECONDS = 300

# Apps directory
APPS_DIR = Path(__file__).parent.parent.parent.parent / "apps"
PLACEHOLDER_APPS_DIR = Path(__file__).parent.parent.parent.parent / "placeholder-apps"

# Docker registry configuration
IMAGE_REGISTRY = "localhost:5000"
IMAGE_TAG = "latest"

# Port allocation configuration
BASE_PORT = 3001  # Starting port for workspace port-forwards (3000 is catalog UI)
PORT_MAPPING_FILE = Path(__file__).parent.parent.parent / "port_mappings.json"
HOSTS_FILE = Path("/etc/hosts")

# Track running port-forward processes
_port_forward_processes: dict[str, subprocess.Popen] = {}


def load_port_mappings() -> dict[str, dict]:
    """Load port mappings from file."""
    if PORT_MAPPING_FILE.exists():
        try:
            return json.loads(PORT_MAPPING_FILE.read_text())
        except Exception:
            pass
    return {}


def save_port_mappings(mappings: dict[str, dict]) -> None:
    """Save port mappings to file."""
    PORT_MAPPING_FILE.write_text(json.dumps(mappings, indent=2))


def allocate_port(workspace_id: str, app_slug: str) -> int:
    """
    Allocate a unique port for a workspace.
    
    Args:
        workspace_id: The workspace ID
        app_slug: The application slug
        
    Returns:
        Allocated port number
    """
    mappings = load_port_mappings()
    
    # Check if workspace already has a port
    if workspace_id in mappings:
        return mappings[workspace_id]["port"]
    
    # Find the next available port
    used_ports = {m["port"] for m in mappings.values()}
    port = BASE_PORT
    while port in used_ports:
        port += 1
    
    # Save mapping
    mappings[workspace_id] = {
        "port": port,
        "app_slug": app_slug,
        "domain": f"{app_slug}.local",
    }
    save_port_mappings(mappings)
    
    logger.info(f"Allocated port {port} for workspace {workspace_id} ({app_slug})")
    return port


def release_port(workspace_id: str) -> None:
    """Release a port allocation for a workspace."""
    mappings = load_port_mappings()
    if workspace_id in mappings:
        del mappings[workspace_id]
        save_port_mappings(mappings)
        logger.info(f"Released port for workspace {workspace_id}")


def get_port_mapping(workspace_id: str) -> dict | None:
    """Get port mapping for a workspace."""
    mappings = load_port_mappings()
    return mappings.get(workspace_id)


def update_hosts_file(domain: str, add: bool = True) -> bool:
    """
    Update /etc/hosts file with domain mapping.
    
    Args:
        domain: Domain name (e.g., 'e-commerce-platform.local')
        add: True to add, False to remove
        
    Returns:
        True if successful
    """
    try:
        hosts_content = HOSTS_FILE.read_text() if HOSTS_FILE.exists() else ""
        lines = hosts_content.splitlines()
        
        # Entry to add/remove
        entry = f"127.0.0.1 {domain}"
        marker = f"# IDP: {domain}"
        full_entry = f"{entry}  {marker}"
        
        # Remove existing entry if present
        new_lines = [line for line in lines if marker not in line and entry not in line]
        
        if add:
            # Add new entry
            new_lines.append(full_entry)
        
        new_content = "\n".join(new_lines)
        if not new_content.endswith("\n"):
            new_content += "\n"
        
        # Write using sudo
        result = subprocess.run(
            ["sudo", "tee", str(HOSTS_FILE)],
            input=new_content.encode(),
            capture_output=True,
            timeout=10,
        )
        
        if result.returncode == 0:
            action = "Added" if add else "Removed"
            logger.info(f"{action} hosts entry for {domain}")
            return True
        else:
            logger.warning(f"Failed to update hosts file: {result.stderr.decode()}")
            return False
            
    except Exception as e:
        logger.warning(f"Could not update hosts file: {e}")
        return False


def start_port_forward(
    workspace_id: str,
    namespace: str,
    service_name: str,
    local_port: int,
    remote_port: int = 3000,
) -> bool:
    """
    Start kubectl port-forward for a workspace.
    
    Args:
        workspace_id: The workspace ID
        namespace: Kubernetes namespace
        service_name: Service name to forward
        local_port: Local port to bind
        remote_port: Remote port in the service
        
    Returns:
        True if started successfully
    """
    global _port_forward_processes
    
    # Stop existing port-forward if any
    stop_port_forward(workspace_id)
    
    try:
        cmd = [
            "kubectl", "port-forward",
            "-n", namespace,
            f"svc/{service_name}",
            f"{local_port}:{remote_port}",
        ]
        
        # Start in background
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        
        _port_forward_processes[workspace_id] = process
        logger.info(f"Started port-forward for {workspace_id}: localhost:{local_port} -> {service_name}:{remote_port}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to start port-forward for {workspace_id}: {e}")
        return False


def stop_port_forward(workspace_id: str) -> None:
    """Stop port-forward for a workspace."""
    global _port_forward_processes
    
    if workspace_id in _port_forward_processes:
        process = _port_forward_processes[workspace_id]
        try:
            process.terminate()
            process.wait(timeout=5)
        except Exception:
            process.kill()
        del _port_forward_processes[workspace_id]
        logger.info(f"Stopped port-forward for {workspace_id}")


def stop_all_port_forwards() -> None:
    """Stop all running port-forwards."""
    global _port_forward_processes
    
    for workspace_id in list(_port_forward_processes.keys()):
        stop_port_forward(workspace_id)


async def get_workspace_by_id(
    session: AsyncSession,
    workspace_id: uuid.UUID,
) -> WorkspaceInstance | None:
    """
    Retrieve a workspace instance by its ID.
    """
    stmt = select(WorkspaceInstance).where(WorkspaceInstance.id == workspace_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def update_workspace_status(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    status: WorkspaceStatus,
    access_url: str | None = None,
    terraform_outputs: dict | None = None,
) -> bool:
    """
    Update the status of a workspace instance.
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


def generate_workspace_slug(workspace_id: uuid.UUID) -> str:
    """Generate a short slug from workspace ID for Kubernetes naming."""
    return str(workspace_id)[:8]


def generate_app_slug(manifest: dict[str, Any]) -> str:
    """Generate a slug from the app name."""
    app_name = manifest.get("appName", "unknown")
    return app_name.lower().replace(" ", "-").replace("_", "-")


# =============================================================================
# Docker Image Building
# =============================================================================

def check_image_exists(image_name: str) -> bool:
    """Check if an image exists in the local registry."""
    try:
        result = subprocess.run(
            ["docker", "manifest", "inspect", image_name],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.returncode == 0
    except Exception:
        return False


def find_app_directory(manifest: dict[str, Any]) -> Path | None:
    """Find the app directory based on manifest."""
    # Try to find the app by name
    app_name = manifest.get("appName", "")
    app_slug = generate_app_slug(manifest)
    
    # Check common directory patterns
    for pattern in [app_slug, app_slug.replace("-", ""), app_name.lower().replace(" ", "")]:
        for app_dir in APPS_DIR.iterdir():
            if app_dir.is_dir() and (app_dir.name.lower() == pattern.lower() or pattern in app_dir.name.lower()):
                return app_dir
    
    return None


def get_component_dockerfile_path(app_dir: Path, component: dict) -> Path | None:
    """Get the Dockerfile path for a component."""
    component_path = component.get("path", "")
    if component_path.startswith("./"):
        component_path = component_path[2:]
    
    component_dir = app_dir / component_path
    dockerfile = component_dir / "Dockerfile"
    
    if dockerfile.exists():
        return dockerfile
    
    return None


def get_placeholder_dockerfile(component_type: str) -> Path | None:
    """Get a placeholder Dockerfile based on component type."""
    type_mapping = {
        "frontend": PLACEHOLDER_APPS_DIR / "frontend",
        "backend": PLACEHOLDER_APPS_DIR / "backend",
        "worker": PLACEHOLDER_APPS_DIR / "worker",
        "database": None,  # Use postgres image directly
    }
    
    placeholder_dir = type_mapping.get(component_type)
    if placeholder_dir and (placeholder_dir / "Dockerfile").exists():
        return placeholder_dir
    
    # Default to backend for unknown types
    return PLACEHOLDER_APPS_DIR / "backend"


def is_minikube_running() -> bool:
    """Check if minikube is the active Kubernetes context."""
    try:
        result = subprocess.run(
            ["kubectl", "config", "current-context"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return "minikube" in result.stdout.lower()
    except Exception:
        return False


def load_image_to_minikube(image_name: str) -> bool:
    """Load a Docker image directly into minikube."""
    try:
        result = subprocess.run(
            ["minikube", "image", "load", image_name],
            capture_output=True,
            text=True,
            timeout=120,
        )
        return result.returncode == 0
    except Exception as e:
        logger.warning(f"Failed to load image to minikube: {e}")
        return False


def build_and_push_image(
    image_name: str,
    dockerfile_dir: Path,
    component_name: str = "",
) -> bool:
    """
    Build and push a Docker image to the local registry.
    Also loads into minikube if that's the active context.
    
    Args:
        image_name: Full image name (e.g., localhost:5000/app-component:latest)
        dockerfile_dir: Directory containing Dockerfile
        component_name: Name of the component (for logging)
        
    Returns:
        True if successful, False otherwise
    """
    logger.info(f"Building image: {image_name} from {dockerfile_dir}")
    
    try:
        # Build the image
        build_result = subprocess.run(
            ["docker", "build", "-t", image_name, "."],
            cwd=dockerfile_dir,
            capture_output=True,
            text=True,
            timeout=300,
        )
        
        if build_result.returncode != 0:
            logger.error(f"Docker build failed for {component_name}: {build_result.stderr}")
            return False
        
        logger.info(f"Built image: {image_name}")
        
        # Push the image to registry
        push_result = subprocess.run(
            ["docker", "push", image_name],
            capture_output=True,
            text=True,
            timeout=120,
        )
        
        if push_result.returncode != 0:
            logger.error(f"Docker push failed for {component_name}: {push_result.stderr}")
            return False
        
        logger.info(f"Pushed image: {image_name}")
        
        # If using minikube, also load the image directly
        if is_minikube_running():
            logger.info(f"Loading image into minikube: {image_name}")
            if load_image_to_minikube(image_name):
                logger.info(f"Loaded image into minikube: {image_name}")
            else:
                logger.warning(f"Failed to load image into minikube (continuing anyway): {image_name}")
        
        return True
        
    except subprocess.TimeoutExpired:
        logger.error(f"Docker build/push timed out for {component_name}")
        return False
    except Exception as e:
        logger.error(f"Docker build/push error for {component_name}: {e}")
        return False


async def ensure_images_exist(manifest: dict[str, Any]) -> tuple[bool, list[str]]:
    """
    Ensure all component images exist, building them if necessary.
    
    Args:
        manifest: App manifest with components
        
    Returns:
        Tuple of (success, list of built images)
    """
    app_slug = generate_app_slug(manifest)
    components = manifest.get("components", [])
    app_dir = find_app_directory(manifest)
    
    built_images = []
    failed_images = []
    
    for component in components:
        component_name = component.get("name", "unknown")
        component_type = component.get("type", "backend")
        image_name = f"{IMAGE_REGISTRY}/{app_slug}-{component_name}:{IMAGE_TAG}"
        
        # Check if image already exists
        if check_image_exists(image_name):
            logger.info(f"Image already exists: {image_name}")
            continue
        
        logger.info(f"Image not found: {image_name}, will build...")
        
        # For databases, always use postgres image directly
        if component_type == "database":
            logger.info(f"Using postgres image for database component: {component_name}")
            try:
                # Pull and tag postgres as the component image
                subprocess.run(
                    ["docker", "pull", "postgres:15-alpine"],
                    capture_output=True,
                    timeout=120,
                )
                subprocess.run(
                    ["docker", "tag", "postgres:15-alpine", image_name],
                    capture_output=True,
                    timeout=30,
                )
                push_result = subprocess.run(
                    ["docker", "push", image_name],
                    capture_output=True,
                    timeout=120,
                )
                if push_result.returncode == 0:
                    # Also load into minikube if applicable
                    if is_minikube_running():
                        load_image_to_minikube(image_name)
                    built_images.append(image_name)
                    logger.info(f"Created database image: {image_name}")
                    continue
            except Exception as e:
                logger.error(f"Failed to create database image: {e}")
                failed_images.append(image_name)
                continue
        
        # Find Dockerfile - first check app directory, then use placeholder
        dockerfile_dir = None
        use_placeholder = False
        
        if app_dir:
            dockerfile_path = get_component_dockerfile_path(app_dir, component)
            if dockerfile_path:
                dockerfile_dir = dockerfile_path.parent
                logger.info(f"Found app Dockerfile: {dockerfile_path}")
        
        # Try to build from app Dockerfile first
        build_success = False
        if dockerfile_dir:
            loop = asyncio.get_event_loop()
            build_success = await loop.run_in_executor(
                None,
                build_and_push_image,
                image_name,
                dockerfile_dir,
                component_name,
            )
            
            if not build_success:
                logger.warning(f"App Dockerfile build failed for {component_name}, falling back to placeholder")
                use_placeholder = True
        else:
            use_placeholder = True
        
        # Fall back to placeholder if no Dockerfile found or build failed
        if use_placeholder:
            dockerfile_dir = get_placeholder_dockerfile(component_type)
            if dockerfile_dir:
                logger.info(f"Using placeholder Dockerfile for {component_name} ({component_type})")
                loop = asyncio.get_event_loop()
                build_success = await loop.run_in_executor(
                    None,
                    build_and_push_image,
                    image_name,
                    dockerfile_dir,
                    component_name,
                )
            else:
                logger.warning(f"No placeholder Dockerfile found for {component_name}")
        
        if build_success:
            built_images.append(image_name)
        else:
            failed_images.append(image_name)
    
    if failed_images:
        logger.error(f"Failed to build images: {failed_images}")
        return False, built_images
    
    return True, built_images


def run_terraform_command(
    command: list[str],
    cwd: Path,
    env: dict | None = None,
) -> tuple[bool, str, str]:
    """Run a Terraform command synchronously."""
    full_env = os.environ.copy()
    if env:
        full_env.update(env)
    
    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            env=full_env,
            capture_output=True,
            text=True,
            timeout=TERRAFORM_TIMEOUT_SECONDS,
        )
        
        success = result.returncode == 0
        return success, result.stdout, result.stderr
        
    except subprocess.TimeoutExpired:
        return False, "", "Command timed out"
    except Exception as e:
        return False, "", str(e)


async def run_terraform_init(workspace_id: uuid.UUID) -> bool:
    """Run terraform init command."""
    workspace_slug = generate_workspace_slug(workspace_id)
    logger.info(f"Running terraform init for workspace {workspace_id}")
    
    loop = asyncio.get_event_loop()
    success, stdout, stderr = await loop.run_in_executor(
        None,
        run_terraform_command,
        ["terraform", "init", "-input=false"],
        TERRAFORM_MODULE_PATH,
        None,
    )
    
    if not success:
        logger.error(f"Terraform init failed: {stderr}")
        return False
    
    logger.info("Terraform init completed successfully")
    
    # Select or create Terraform workspace for this app
    # This ensures each workspace has isolated state
    logger.info(f"Selecting/creating Terraform workspace: ws-{workspace_slug}")
    success, stdout, stderr = await loop.run_in_executor(
        None,
        run_terraform_command,
        ["terraform", "workspace", "select", "-or-create", f"ws-{workspace_slug}"],
        TERRAFORM_MODULE_PATH,
        None,
    )
    
    if not success:
        logger.error(f"Terraform workspace select failed: {stderr}")
        return False
    
    logger.info(f"Terraform workspace ws-{workspace_slug} selected")
    return True


async def run_terraform_apply(
    workspace_id: uuid.UUID,
    manifest: dict[str, Any],
) -> tuple[bool, dict]:
    """Run terraform apply command with the manifest."""
    workspace_slug = generate_workspace_slug(workspace_id)
    app_slug = generate_app_slug(manifest)
    
    logger.info(f"Running terraform apply for workspace {workspace_id} (slug: {workspace_slug})")
    
    # Create tfvars content
    tfvars_content = f'''
workspace_id = "{workspace_slug}"
app_manifest_json = {json.dumps(json.dumps(manifest))}
image_registry = "localhost:5000"
image_tag = "latest"
ingress_enabled = true
ingress_class_name = "nginx"
enable_database = true
'''
    
    # Write temporary tfvars file
    tfvars_path = TERRAFORM_MODULE_PATH / f"workspace-{workspace_slug}.tfvars"
    tfvars_path.write_text(tfvars_content)
    
    try:
        loop = asyncio.get_event_loop()
        
        # Ensure we're in the right Terraform workspace
        logger.info(f"Selecting Terraform workspace: ws-{workspace_slug}")
        success, stdout, stderr = await loop.run_in_executor(
            None,
            run_terraform_command,
            ["terraform", "workspace", "select", "-or-create", f"ws-{workspace_slug}"],
            TERRAFORM_MODULE_PATH,
            None,
        )
        
        if not success:
            logger.error(f"Terraform workspace select failed: {stderr}")
            return False, {}
        
        # Run terraform apply
        success, stdout, stderr = await loop.run_in_executor(
            None,
            run_terraform_command,
            [
                "terraform", "apply",
                "-auto-approve",
                "-input=false",
                f"-var-file={tfvars_path.name}",
            ],
            TERRAFORM_MODULE_PATH,
            None,
        )
        
        if not success:
            logger.error(f"Terraform apply failed: {stderr}")
            return False, {}
        
        logger.info("Terraform apply completed successfully")
        
        # Get outputs
        success, stdout, stderr = await loop.run_in_executor(
            None,
            run_terraform_command,
            ["terraform", "output", "-json"],
            TERRAFORM_MODULE_PATH,
            None,
        )
        
        outputs = {}
        if success and stdout:
            try:
                raw_outputs = json.loads(stdout)
                outputs = {k: v.get("value") for k, v in raw_outputs.items()}
            except json.JSONDecodeError:
                logger.warning("Failed to parse Terraform outputs")
        
        return True, outputs
        
    finally:
        if tfvars_path.exists():
            tfvars_path.unlink()


async def run_terraform_destroy(workspace_id: uuid.UUID) -> bool:
    """Run terraform destroy command."""
    workspace_slug = generate_workspace_slug(workspace_id)
    logger.info(f"Running terraform destroy for workspace {workspace_id}")
    
    async with async_session() as session:
        workspace = await get_workspace_by_id(session, workspace_id)
        if not workspace:
            logger.error(f"Workspace not found for destroy: {workspace_id}")
            return False
        
        from app.models import AppCatalog
        app_stmt = select(AppCatalog).where(AppCatalog.id == workspace.catalog_id)
        app_result = await session.execute(app_stmt)
        app = app_result.scalar_one_or_none()
        
        if not app:
            logger.error(f"App not found for workspace: {workspace_id}")
            return False
        
        manifest = app.manifest_payload
    
    tfvars_content = f'''
workspace_id = "{workspace_slug}"
app_manifest_json = {json.dumps(json.dumps(manifest))}
image_registry = "localhost:5000"
image_tag = "latest"
ingress_enabled = true
ingress_class_name = "nginx"
enable_database = true
'''
    
    tfvars_path = TERRAFORM_MODULE_PATH / f"workspace-{workspace_slug}.tfvars"
    tfvars_path.write_text(tfvars_content)
    
    try:
        loop = asyncio.get_event_loop()
        
        # Select the correct Terraform workspace before destroying
        logger.info(f"Selecting Terraform workspace: ws-{workspace_slug}")
        success, stdout, stderr = await loop.run_in_executor(
            None,
            run_terraform_command,
            ["terraform", "workspace", "select", f"ws-{workspace_slug}"],
            TERRAFORM_MODULE_PATH,
            None,
        )
        
        if not success:
            logger.warning(f"Terraform workspace select failed (may not exist): {stderr}")
            # Workspace might not exist, try to continue anyway
        
        success, stdout, stderr = await loop.run_in_executor(
            None,
            run_terraform_command,
            [
                "terraform", "destroy",
                "-auto-approve",
                "-input=false",
                f"-var-file={tfvars_path.name}",
            ],
            TERRAFORM_MODULE_PATH,
            None,
        )
        
        if not success:
            logger.error(f"Terraform destroy failed: {stderr}")
            return False
        
        logger.info("Terraform destroy completed successfully")
        
        # Clean up the Terraform workspace after destroy
        # First switch back to default, then delete the workspace
        await loop.run_in_executor(
            None,
            run_terraform_command,
            ["terraform", "workspace", "select", "default"],
            TERRAFORM_MODULE_PATH,
            None,
        )
        
        await loop.run_in_executor(
            None,
            run_terraform_command,
            ["terraform", "workspace", "delete", f"ws-{workspace_slug}"],
            TERRAFORM_MODULE_PATH,
            None,
        )
        
        return True
        
    finally:
        if tfvars_path.exists():
            tfvars_path.unlink()


async def setup_local_access(
    workspace_id: uuid.UUID,
    manifest: dict[str, Any],
    namespace: str,
) -> str:
    """
    Set up local access for a workspace with custom domain.
    
    Args:
        workspace_id: The workspace ID
        manifest: App manifest
        namespace: Kubernetes namespace
        
    Returns:
        Access URL (e.g., http://e-commerce-platform.local:3001)
    """
    workspace_id_str = str(workspace_id)
    app_slug = generate_app_slug(manifest)
    
    # Allocate unique port
    port = allocate_port(workspace_id_str, app_slug)
    domain = f"{app_slug}.local"
    
    # Update /etc/hosts
    update_hosts_file(domain, add=True)
    
    # Find the frontend service name
    components = manifest.get("components", [])
    frontend_component = next(
        (c for c in components if c.get("type") == "frontend"),
        components[0] if components else None
    )
    
    if frontend_component:
        service_name = f"{app_slug}-{frontend_component['name']}"
        remote_port = frontend_component.get("port", 3000)
    else:
        service_name = f"{app_slug}-web-ui"
        remote_port = 3000
    
    # Start port-forward
    start_port_forward(
        workspace_id_str,
        namespace,
        service_name,
        port,
        remote_port,
    )
    
    access_url = f"http://{domain}:{port}"
    logger.info(f"Local access configured: {access_url}")
    
    return access_url


async def cleanup_local_access(workspace_id: uuid.UUID) -> None:
    """Clean up local access (port-forward, hosts entry) for a workspace."""
    workspace_id_str = str(workspace_id)
    
    # Stop port-forward
    stop_port_forward(workspace_id_str)
    
    # Get mapping to find domain
    mapping = get_port_mapping(workspace_id_str)
    if mapping:
        domain = mapping.get("domain")
        if domain:
            update_hosts_file(domain, add=False)
    
    # Release port
    release_port(workspace_id_str)


async def update_catalog_build_status(
    session: AsyncSession,
    catalog_id: uuid.UUID,
    build_status: BuildStatus,
) -> None:
    """Update the build status of a catalog entry."""
    from sqlalchemy import select
    
    stmt = select(AppCatalog).where(AppCatalog.id == catalog_id)
    result = await session.execute(stmt)
    catalog = result.scalar_one_or_none()
    
    if catalog:
        catalog.build_status = build_status.value
        catalog.updated_at = datetime.utcnow()
        session.add(catalog)
        await session.commit()
        logger.info(f"Updated catalog {catalog_id} build_status to: {build_status.value}")


async def build_app_images(catalog_id: uuid.UUID, manifest: dict[str, Any]) -> None:
    """
    Build Docker images for an application.
    
    This is a background task that builds all component images for an app
    without deploying a workspace. This allows pre-building images for faster
    workspace spin-up later.
    
    Args:
        catalog_id: The catalog entry ID
        manifest: App manifest with components
    """
    logger.info(f"Starting image build for catalog: {catalog_id}")
    
    try:
        # Build all images
        images_ok, built_images = await ensure_images_exist(manifest)
        
        if built_images:
            logger.info(f"Built {len(built_images)} images: {built_images}")
        
        # Update catalog build status
        async with async_session() as session:
            if images_ok:
                await update_catalog_build_status(
                    session=session,
                    catalog_id=catalog_id,
                    build_status=BuildStatus.BUILT,
                )
                logger.info(f"Successfully built images for catalog {catalog_id}")
            else:
                await update_catalog_build_status(
                    session=session,
                    catalog_id=catalog_id,
                    build_status=BuildStatus.FAILED,
                )
                logger.error(f"Failed to build images for catalog {catalog_id}")
                
    except Exception as e:
        logger.error(f"Failed to build images for catalog {catalog_id}: {e}")
        
        try:
            async with async_session() as session:
                await update_catalog_build_status(
                    session=session,
                    catalog_id=catalog_id,
                    build_status=BuildStatus.FAILED,
                )
        except Exception as update_error:
            logger.error(f"Failed to update build status to FAILED: {update_error}")


async def provision_workspace(workspace_id: uuid.UUID, manifest: dict[str, Any]) -> None:
    """
    Provision a workspace instance asynchronously.
    
    This is the main background task that handles the full provisioning flow:
    1. Ensures all Docker images exist (builds if necessary)
    2. Runs terraform init
    3. Runs terraform apply
    4. Sets up local DNS and port-forwarding
    5. Updates workspace status to RUNNING on success or FAILED on error
    """
    logger.info(f"Starting provisioning for workspace: {workspace_id}")
    
    try:
        # Step 1: Ensure all Docker images exist
        logger.info(f"Checking/building Docker images for workspace {workspace_id}")
        images_ok, built_images = await ensure_images_exist(manifest)
        
        if built_images:
            logger.info(f"Built {len(built_images)} images: {built_images}")
        
        if not images_ok:
            raise Exception("Failed to build required Docker images")
        
        # Step 2: Run terraform init
        init_success = await run_terraform_init(workspace_id)
        if not init_success:
            raise Exception("Terraform init failed")
        
        # Step 3: Run terraform apply
        apply_success, outputs = await run_terraform_apply(workspace_id, manifest)
        if not apply_success:
            raise Exception("Terraform apply failed")
        
        namespace = outputs.get("namespace", f"ws-{generate_workspace_slug(workspace_id)}")
        
        # Wait a bit for pods to be ready
        await asyncio.sleep(5)
        
        # Set up local access with custom domain
        access_url = await setup_local_access(workspace_id, manifest, namespace)
        
        # Update workspace status
        async with async_session() as session:
            await update_workspace_status(
                session=session,
                workspace_id=workspace_id,
                status=WorkspaceStatus.RUNNING,
                access_url=access_url,
                terraform_outputs=outputs,
            )
        
        logger.info(
            f"Successfully provisioned workspace {workspace_id}. "
            f"Namespace: {namespace}, Access URL: {access_url}"
        )
        
    except Exception as e:
        logger.error(f"Failed to provision workspace {workspace_id}: {e}")
        
        try:
            async with async_session() as session:
                await update_workspace_status(
                    session=session,
                    workspace_id=workspace_id,
                    status=WorkspaceStatus.FAILED,
                )
        except Exception as update_error:
            logger.error(f"Failed to update workspace status to FAILED: {update_error}")


async def destroy_workspace(workspace_id: uuid.UUID) -> None:
    """
    Destroy a workspace instance asynchronously.
    
    Cleans up local access and runs terraform destroy.
    """
    logger.info(f"Starting destruction for workspace: {workspace_id}")
    
    try:
        # Clean up local access first
        await cleanup_local_access(workspace_id)
        
        # Run terraform destroy
        success = await run_terraform_destroy(workspace_id)
        
        if not success:
            raise Exception("Terraform destroy failed")
        
        async with async_session() as session:
            await update_workspace_status(
                session=session,
                workspace_id=workspace_id,
                status=WorkspaceStatus.DESTROYED,
            )
        
        logger.info(f"Successfully destroyed workspace {workspace_id}")
        
    except Exception as e:
        logger.error(f"Failed to destroy workspace {workspace_id}: {e}")


async def destroy_existing_workspace(workspace_id: uuid.UUID) -> bool:
    """
    Quickly destroy an existing workspace by deleting its namespace directly.
    
    This is a faster cleanup method used when re-deploying the same app.
    Does NOT update the database - caller is responsible for that.
    
    Args:
        workspace_id: The workspace ID to destroy
        
    Returns:
        True if successful, False otherwise
    """
    workspace_slug = generate_workspace_slug(workspace_id)
    namespace = f"ws-{workspace_slug}"
    
    logger.info(f"Quick-destroying workspace {workspace_id} (namespace: {namespace})")
    
    try:
        # Clean up local access (port-forward, hosts entry)
        await cleanup_local_access(workspace_id)
        
        # Delete the namespace directly (faster than terraform destroy)
        result = subprocess.run(
            ["kubectl", "delete", "namespace", namespace, "--ignore-not-found", "--wait=false"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        
        if result.returncode != 0:
            logger.warning(f"kubectl delete namespace failed: {result.stderr}")
        else:
            logger.info(f"Deleted namespace {namespace}")
        
        # Wait a moment for cleanup
        await asyncio.sleep(2)
        
        # Force delete if still exists
        check_result = subprocess.run(
            ["kubectl", "get", "namespace", namespace],
            capture_output=True,
            text=True,
            timeout=10,
        )
        
        if check_result.returncode == 0:
            # Still exists, force delete
            logger.info(f"Force deleting namespace {namespace}")
            subprocess.run(
                ["kubectl", "delete", "namespace", namespace, "--force", "--grace-period=0"],
                capture_output=True,
                text=True,
                timeout=30,
            )
        
        logger.info(f"Quick-destroy completed for workspace {workspace_id}")
        return True
        
    except subprocess.TimeoutExpired:
        logger.error(f"Timeout destroying workspace {workspace_id}")
        return False
    except Exception as e:
        logger.error(f"Error destroying workspace {workspace_id}: {e}")
        return False
