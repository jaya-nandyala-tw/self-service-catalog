# Self-Service Catalog

An Internal Developer Platform (IDP) that enables developers to discover, browse, and deploy applications from a centralized catalog. The platform uses a manifest-driven approach where applications define their topology through configuration files.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Self-Service Catalog                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐      ┌──────────────────┐      ┌───────────────────────┐  │
│  │              │      │                  │      │                       │  │
│  │  Catalog UI  │─────▶│  Catalog Backend │─────▶│  PostgreSQL Database  │  │
│  │  (Next.js)   │      │  (FastAPI)       │      │                       │  │
│  │  Port: 3000  │      │  Port: 8000      │      │  Port: 5432           │  │
│  │              │      │                  │      │                       │  │
│  └──────────────┘      └────────┬─────────┘      └───────────────────────┘  │
│                                 │                                           │
│                                 ▼                                           │
│                        ┌──────────────────┐                                 │
│                        │                  │                                 │
│                        │   /apps folder   │  ◀── Source of Truth            │
│                        │  (app-manifests) │                                 │
│                        │                  │                                 │
│                        └──────────────────┘                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
self-service-catalog/
├── apps/                      # Application definitions (source of truth)
│   ├── blog-platform/         # Example: Simple blog API
│   │   ├── api/
│   │   │   └── Dockerfile
│   │   └── app-manifest.json
│   └── ecommerce/             # Example: Full-stack e-commerce
│       ├── frontend/
│       │   └── Dockerfile
│       ├── backend/
│       │   └── Dockerfile
│       ├── worker/
│       │   └── Dockerfile
│       └── app-manifest.json
├── catalog-backend/           # FastAPI backend service
│   ├── app/
│   │   ├── main.py           # Application entry point
│   │   ├── config.py         # Configuration management
│   │   ├── database.py       # Async PostgreSQL setup
│   │   ├── models.py         # SQLModel database models
│   │   ├── routers/          # API route handlers
│   │   └── services/         # Business logic
│   ├── alembic/              # Database migrations
│   └── requirements.txt
├── catalog-ui/                # Next.js frontend
│   ├── src/
│   │   ├── app/              # Next.js App Router pages
│   │   ├── components/       # React components
│   │   ├── lib/              # API client & utilities
│   │   └── providers/        # React context providers
│   └── package.json
└── README.md                  # This file
```

## Features

- **Application Catalog**: Browse all available applications with their topology
- **Manifest-Driven**: Applications define their components via `app-manifest.json`
- **Visual Topology**: See component relationships and dependencies
- **Workspace Management**: Create and manage developer workspaces
- **Auto-Sync**: Automatically scan and sync applications from the apps directory

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL 14+ (or Docker)
- Git

### 1. Start PostgreSQL

Using Docker:

```bash
docker run -d \
  --name catalog-postgres \
  -e POSTGRES_USER=catalog_user \
  -e POSTGRES_PASSWORD=catalog_password \
  -e POSTGRES_DB=catalog_db \
  -p 5432:5432 \
  postgres:16-alpine
```

Or use an existing PostgreSQL instance and create the database:

```sql
CREATE DATABASE catalog_db;
CREATE USER catalog_user WITH PASSWORD 'catalog_password';
GRANT ALL PRIVILEGES ON DATABASE catalog_db TO catalog_user;
```

### 2. Start the Backend

```bash
cd catalog-backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run database migrations (optional, tables auto-create)
alembic upgrade head

# Start the server
uvicorn app.main:app --reload
```

The API will be available at http://localhost:8000

### 3. Start the Frontend

```bash
cd catalog-ui

# Install dependencies
npm install

# Start the development server
npm run dev
```

The UI will be available at http://localhost:3000

### 4. Sync the Catalog

Once both services are running:

1. Open http://localhost:3000
2. Click "Sync Catalog" in the sidebar
3. The applications from the `apps/` directory will appear in the catalog

## App Manifest Schema

Each application must have an `app-manifest.json` file defining its topology:

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
    },
    {
      "name": "worker",
      "type": "worker",
      "path": "./worker",
      "port": 5555
    }
  ]
}
```

### Component Types

| Type | Description |
|------|-------------|
| `frontend` | UI/web client applications |
| `backend` | API servers and services |
| `worker` | Background job processors |

### Validation Rules

1. Each component must have a `Dockerfile` at its specified path
2. Component names must be unique within an app
3. Ports must be valid (1-65535)

## API Documentation

When the backend is running:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/catalog` | List all apps in the catalog |
| `GET` | `/api/v1/catalog/{slug}` | Get a specific app by slug |
| `POST` | `/api/v1/catalog/sync` | Trigger a catalog sync |
| `GET` | `/api/v1/workspaces` | List all workspaces |
| `POST` | `/api/v1/workspaces` | Create a new workspace |
| `DELETE` | `/api/v1/workspaces/{id}` | Destroy a workspace |

## Configuration

### Backend Environment Variables

Create a `.env` file in `catalog-backend/`:

```env
# Application
APP_NAME=Catalog Service
APP_VERSION=1.0.0
DEBUG=true

# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=catalog_user
POSTGRES_PASSWORD=catalog_password
POSTGRES_DB=catalog_db

# Apps Directory
APPS_DIR=../apps
```

### Frontend Environment Variables

Create a `.env.local` file in `catalog-ui/`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Adding New Applications

1. Create a new folder under `apps/`:
   ```bash
   mkdir -p apps/my-new-app/service
   ```

2. Add a `Dockerfile` for each component:
   ```bash
   touch apps/my-new-app/service/Dockerfile
   ```

3. Create the `app-manifest.json`:
   ```json
   {
     "appName": "My New App",
     "description": "Description of my new application",
     "components": [
       {
         "name": "service",
         "type": "backend",
         "path": "./service",
         "port": 8080
       }
     ]
   }
   ```

4. Sync the catalog via the UI or API:
   ```bash
   curl -X POST http://localhost:8000/api/v1/catalog/sync
   ```

## Tech Stack

### Backend
- **Language**: Python 3.10+
- **Framework**: FastAPI
- **Database**: PostgreSQL (async with asyncpg)
- **ORM**: SQLModel (Pydantic + SQLAlchemy)
- **Migrations**: Alembic

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui
- **State Management**: TanStack Query
- **HTTP Client**: Axios

## Development

### Running Tests

```bash
# Backend
cd catalog-backend
pytest

# Frontend
cd catalog-ui
npm test
```

### Creating Database Migrations

```bash
cd catalog-backend
alembic revision --autogenerate -m "Description of changes"
alembic upgrade head
```

## Troubleshooting

### "Failed to load catalog"
- Ensure the backend is running on port 8000
- Check that PostgreSQL is running and accessible
- Verify CORS is enabled (configured by default)

### "Apps directory does not exist"
- Verify the `APPS_DIR` environment variable points to the correct path
- Default is `../apps` (relative to catalog-backend)

### Database Connection Errors
- Ensure PostgreSQL is running: `docker ps`
- Check credentials in `.env` file
- Verify the database exists: `psql -U catalog_user -d catalog_db`

## License

Internal use only.

