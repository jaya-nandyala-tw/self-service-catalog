# Catalog Service Backend

A FastAPI-based backend service for the Internal Developer Platform (IDP). This service acts as the bridge between the UI, the physical file system (Git repo), and the Infrastructure Engine (Terraform).

## Architecture

The Catalog Service is **manifest-driven**:

1. **Source of Truth**: Application source code lives in the `../../apps` directory (configurable)
2. **The Manifest**: Each app folder contains an `app-manifest.json` defining its topology
3. **The Scanner**: Scans the apps directory, validates manifests, and syncs to the database
4. **The Provisioner**: Creates workspace instances and triggers Terraform (currently mocked)

## Project Structure

```
catalog-backend/
├── app/
│   ├── main.py              # FastAPI application entry point
│   ├── config.py            # Configuration management
│   ├── database.py          # Async PostgreSQL setup
│   ├── models.py            # SQLModel database models
│   ├── routers/
│   │   ├── catalog.py       # Catalog API endpoints
│   │   └── workspaces.py    # Workspaces API endpoints
│   └── services/
│       ├── scanner.py       # Manifest scanner logic
│       └── terraform_service.py  # Terraform provisioning
├── alembic/                  # Database migrations
├── .env                      # Environment configuration
├── .env.example              # Example configuration
├── alembic.ini               # Alembic configuration
└── requirements.txt          # Python dependencies
```

## Tech Stack

- **Language**: Python 3.10+
- **Framework**: FastAPI
- **Database**: PostgreSQL (using asyncpg)
- **ORM**: SQLModel (Pydantic + SQLAlchemy)
- **Migrations**: Alembic
- **Async**: FastAPI BackgroundTasks for long-running operations

## Installation

### Prerequisites

- Python 3.10+
- PostgreSQL 14+
- Git

### Setup

1. **Create a virtual environment**:
   ```bash
   cd catalog-backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

4. **Create the database**:
   ```sql
   CREATE DATABASE catalog_db;
   CREATE USER catalog_user WITH PASSWORD 'catalog_password';
   GRANT ALL PRIVILEGES ON DATABASE catalog_db TO catalog_user;
   ```

5. **Run migrations**:
   ```bash
   alembic upgrade head
   ```

6. **Start the server**:
   ```bash
   uvicorn app.main:app --reload
   ```

The API will be available at `http://localhost:8000`

## API Endpoints

### Health

- `GET /` - Service info
- `GET /health` - Health check

### Catalog

- `GET /api/v1/catalog` - List all apps in the catalog
- `GET /api/v1/catalog/{slug}` - Get a specific app by slug
- `POST /api/v1/catalog/sync` - Trigger a catalog sync from the apps directory

### Workspaces

- `POST /api/v1/workspaces` - Create a new workspace (triggers provisioning)
- `GET /api/v1/workspaces` - List all workspaces
- `GET /api/v1/workspaces/{workspace_id}` - Get a specific workspace
- `DELETE /api/v1/workspaces/{workspace_id}` - Destroy a workspace

## App Manifest Schema

Each application must have an `app-manifest.json` file:

```json
{
  "appName": "My Application",
  "description": "A description of what this app does",
  "components": [
    {
      "name": "frontend",
      "type": "frontend",
      "path": "./frontend",
      "port": 3000
    },
    {
      "name": "api",
      "type": "backend",
      "path": "./backend",
      "port": 8080
    }
  ]
}
```

### Component Types

- `frontend` - UI/web client
- `backend` - API server
- `worker` - Background job processor

### Validation Rules

1. Each component must have a `Dockerfile` at its specified path
2. Component names must be unique within an app
3. Ports must be valid (1-65535)

## Development

### Running Tests

```bash
pytest
```

### Creating Migrations

```bash
alembic revision --autogenerate -m "Description of changes"
```

### Applying Migrations

```bash
alembic upgrade head
```

## API Documentation

When the server is running:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_NAME` | Service name | Catalog Service |
| `APP_VERSION` | Service version | 1.0.0 |
| `DEBUG` | Enable debug mode | false |
| `POSTGRES_HOST` | Database host | localhost |
| `POSTGRES_PORT` | Database port | 5432 |
| `POSTGRES_USER` | Database user | catalog_user |
| `POSTGRES_PASSWORD` | Database password | - |
| `POSTGRES_DB` | Database name | catalog_db |
| `APPS_DIR` | Path to apps directory | ../../apps |

## License

Internal use only.

