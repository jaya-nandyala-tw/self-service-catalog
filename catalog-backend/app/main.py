"""
FastAPI application entry point for the Catalog Service.

This service acts as the bridge between the UI, the physical file system (Git repo),
and the Infrastructure Engine (Terraform).
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers import catalog, workspaces

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.
    
    Startup:
    - Initialize database tables
    
    Shutdown:
    - Clean up resources
    """
    # Startup
    logger.info("Starting Catalog Service...")
    logger.info(f"Apps directory: {settings.apps_directory_path}")
    
    # Initialize database tables
    await init_db()
    logger.info("Database initialized")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Catalog Service...")


# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Catalog Service Backend for the Internal Developer Platform. "
        "Manages application manifests, validates configurations, "
        "and provisions developer workspaces."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(catalog.router, prefix="/api/v1")
app.include_router(workspaces.router, prefix="/api/v1")


@app.get("/", tags=["Health"])
async def root() -> dict:
    """Root endpoint - basic service info."""
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "status": "healthy",
    }


@app.get("/health", tags=["Health"])
async def health_check() -> dict:
    """Health check endpoint for monitoring."""
    return {
        "status": "healthy",
        "service": settings.app_name,
        "version": settings.app_version,
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
    )

