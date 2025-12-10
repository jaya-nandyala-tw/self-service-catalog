# Self-Service Catalog

A developer platform for one-click application deployments to Kubernetes.

![Platform Overview](https://img.shields.io/badge/Platform-Internal%20Developer%20Platform-blue)
![Stack](https://img.shields.io/badge/Stack-Next.js%20%7C%20FastAPI%20%7C%20Terraform-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- 🚀 **One-Click Deployments** - Deploy apps with a single button click
- 📦 **Universal Infrastructure** - Any app topology from JSON manifest
- 🔄 **Auto Image Building** - Builds Docker images on-demand
- 🌐 **Local DNS** - Access apps via `app-name.local` domains
- 🎨 **Modern UI** - Beautiful dark-themed catalog interface

## Prerequisites

- Docker Desktop
- Minikube
- kubectl
- Terraform
- Node.js 18+
- Python 3.11+

## Quick Start

### 1. One-Time Setup

```bash
# Clone and enter the project
cd self-service-catalog

# Run setup (requires sudo for /etc/hosts)
./setup.sh
```

This will:
- Start minikube and enable ingress
- Start PostgreSQL and Docker registry containers
- Install Python and Node.js dependencies
- Configure local DNS entries

### 2. Start the Platform

```bash
./start.sh
```

### 3. Open the Catalog

Visit **http://localhost:3000** in your browser.

### 4. Deploy an App

1. Browse the catalog
2. Click on an app (e.g., "Social Platform")
3. Click **Spin Up**
4. Wait for deployment (watch the status)
5. Click the access URL when ready

## Scripts

| Script | Purpose | Requires Sudo |
|--------|---------|---------------|
| `./setup.sh` | One-time setup, DNS config | Yes |
| `./start.sh` | Start backend & frontend | No |
| `./stop.sh` | Stop servers (preserves state) | No |
| `./cleanup.sh` | Full cleanup including DNS | Yes |

## Project Structure

```
├── apps/                    # App definitions (manifests + Dockerfiles)
├── catalog-backend/         # FastAPI backend (port 8000)
├── catalog-ui/              # Next.js frontend (port 3000)
├── infrastructure/          # Helm charts & Terraform modules
└── placeholder-apps/        # Default images for testing
```

## Adding a New App

1. Create a folder in `apps/`:
```
apps/my-app/
├── app-manifest.json
├── frontend/
│   └── Dockerfile
└── backend/
    └── Dockerfile
```

2. Define the manifest:
```json
{
  "appName": "My App",
  "description": "Description here",
  "components": [
    {
      "name": "web",
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

3. Run setup to add DNS:
```bash
./setup.sh
```

4. Sync catalog in UI (Settings → Re-sync Catalog)

## Troubleshooting

### App won't start (ImagePullBackOff)

```bash
# Reload images into minikube
minikube image load localhost:5000/app-name-component:latest
kubectl rollout restart deployment -n ws-{workspace-id}
```

### Can't access app URL

```bash
# Check if port-forward is running
lsof -i :3001

# Restart manually if needed
kubectl port-forward -n ws-{id} svc/app-name-web 3001:3000
```

### DNS not working

```bash
# Verify hosts entry exists
grep "app-name.local" /etc/hosts

# Re-run setup if missing
./setup.sh
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/catalog` | GET | List all apps |
| `/api/v1/catalog/sync` | POST | Sync from filesystem |
| `/api/v1/workspaces` | GET | List workspaces |
| `/api/v1/workspaces` | POST | Create workspace |
| `/api/v1/workspaces/{id}` | DELETE | Destroy workspace |
| `/api/v1/workspaces?confirm=true` | DELETE | Destroy all |

API docs: http://localhost:8000/docs

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed design documentation.

## Tech Stack

- **Frontend**: Next.js 14, React Query, Tailwind CSS, shadcn/ui
- **Backend**: FastAPI, SQLAlchemy, PostgreSQL
- **Infrastructure**: Terraform, Helm, Kubernetes (minikube)
- **Containers**: Docker, local registry

## License

MIT
