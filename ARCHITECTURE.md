# Architecture & Design Decisions

## Overview

The Self-Service Catalog is an Internal Developer Platform (IDP) that enables developers to deploy applications with a single click. It provides a universal infrastructure layer that can deploy any application topology defined in a JSON manifest without writing new Terraform or Helm code for each app.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Self-Service Catalog                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────────┐ │
│  │  Catalog UI  │────▶│   Backend    │────▶│     Terraform Service        │ │
│  │  (Next.js)   │     │  (FastAPI)   │     │  (Provisioner)               │ │
│  │  Port 3000   │     │  Port 8000   │     │                              │ │
│  └──────────────┘     └──────┬───────┘     │  1. Build Docker Images      │ │
│                              │             │  2. Push to Registry         │ │
│                              ▼             │  3. Load into Minikube       │ │
│                       ┌──────────────┐     │  4. Terraform Init/Apply     │ │
│                       │  PostgreSQL  │     │  5. Setup Port-Forwards      │ │
│                       │  (Catalog DB)│     └──────────────┬───────────────┘ │
│                       │  Port 5432   │                    │                 │
│                       └──────────────┘                    ▼                 │
│                                            ┌──────────────────────────────┐ │
│                                            │     Kubernetes (Minikube)    │ │
│                                            │                              │ │
│                                            │  ┌────────────────────────┐  │ │
│                                            │  │   Universal Helm Chart │  │ │
│                                            │  │   (Deployments, Svcs,  │  │ │
│                                            │  │    Ingress, StatefulSt)│  │ │
│                                            │  └────────────────────────┘  │ │
│                                            └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Kubernetes Deployment Architecture

When a workspace is spun up, the following resources are created in Kubernetes:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              Kubernetes Cluster (Minikube)                              │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │                        Namespace: ws-{workspace-slug}                             │  │
│  │                        (e.g., ws-e-commerce-platform-abc123)                      │  │
│  ├───────────────────────────────────────────────────────────────────────────────────┤  │
│  │                                                                                   │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │                           INGRESS CONTROLLER                                │  │  │
│  │  │                    (nginx-ingress / minikube ingress)                       │  │  │
│  │  │                                                                             │  │  │
│  │  │   Host: e-commerce-platform.local ──────────────────────────┐               │  │  │
│  │  │                                                             │               │  │  │
│  │  └─────────────────────────────────────────────────────────────┼───────────────┘  │  │
│  │                                                                │                  │  │
│  │                                                                ▼                  │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │                            SERVICES (ClusterIP)                             │  │  │
│  │  ├─────────────────────────────────────────────────────────────────────────────┤  │  │
│  │  │                                                                             │  │  │
│  │  │    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐    │  │  │
│  │  │    │ frontend-svc│   │ backend-svc │   │  worker-svc │   │database-svc │    │  │  │
│  │  │    │   :3000     │   │   :8080     │   │   :5000     │   │   :5432     │    │  │  │
│  │  │    └──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘    │  │  │
│  │  │           │                 │                 │                 │           │  │  │
│  │  └───────────┼─────────────────┼─────────────────┼─────────────────┼───────────┘  │  │
│  │              │                 │                 │                 │              │  │
│  │              ▼                 ▼                 ▼                 ▼              │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │                              PODS (Deployments)                             │  │  │
│  │  ├─────────────────────────────────────────────────────────────────────────────┤  │  │
│  │  │                                                                             │  │  │
│  │  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌─────────────────┐  │  │  │
│  │  │  │   FRONTEND    │ │   BACKEND     │ │    WORKER     │ │    DATABASE     │  │  │  │
│  │  │  │   ┌───────┐   │ │   ┌───────┐   │ │   ┌───────┐   │ │   ┌─────────┐   │  │  │  │
│  │  │  │   │ nginx │   │ │   │ flask │   │ │   │ flask │   │ │   │postgres │   │  │  │  │
│  │  │  │   │:3000  │   │ │   │:8080  │   │ │   │:5000  │   │ │   │ :5432   │   │  │  │  │
│  │  │  │   └───────┘   │ │   └───────┘   │ │   └───────┘   │ │   └─────────┘   │  │  │  │
│  │  │  │               │ │               │ │               │ │    (StatefulSet)│  │  │  │
│  │  │  │  Replicas: 1  │ │  Replicas: 1  │ │  Replicas: 1  │ │   Replicas: 1   │  │  │  │
│  │  │  └───────────────┘ └───────────────┘ └───────────────┘ └─────────────────┘  │  │  │
│  │  │                                                                             │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                   │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Port-Forward & Local Access Architecture

Since Minikube runs in a VM/container, we use port-forwarding to expose services locally:

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                    LOCAL MACHINE                                         │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│   ┌─────────────────┐          ┌────────────────────────────────────────────────────┐    │
│   │   /etc/hosts    │          │              Port-Forward Processes                │    │
│   ├─────────────────┤          │              (kubectl port-forward)                │    │
│   │                 │          ├────────────────────────────────────────────────────┤    │
│   │ 127.0.0.1       │          │                                                    │    │
│   │ e-commerce-     │          │   localhost:3001 ───────────────────────────┐      │    │
│   │ platform.local  │          │                                             │      │    │
│   │                 │          │   localhost:3002 ─────────────────────┐     │      │    │
│   │ 127.0.0.1       │          │                                       │     │      │    │
│   │ blog-platform   │          │   localhost:3003 ───────────────┐     │     │      │    │
│   │ .local          │          │                                 │     │     │      │    │
│   │                 │          └─────────────────────────────────┼─────┼─────┼──────┘    │
│   └─────────────────┘                                            │     │     │           │
│                                                                  │     │     │           │
│   ┌──────────────────────────────────────────────────────────────┼─────┼─────┼──────┐    │
│   │                        BROWSER                               │     │     │      │    │
│   ├──────────────────────────────────────────────────────────────┼─────┼─────┼──────┤    │
│   │                                                              │     │     │      │    │
│   │   http://e-commerce-platform.local:3001 ─────────────────────┘     │     │      │    │
│   │                                                                    │     │      │    │
│   │   http://blog-platform.local:3002 ─────────────────────────────────┘     │      │    │
│   │                                                                          │      │    │
│   │   http://social-platform.local:3003 ─────────────────────────────────────┘      │    │
│   │                                                                                 │    │
│   └─────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                          │
└───────────────────────────────────────────────────────────────────────────────┬──────────┘
                                                                                │
                                        Port-Forward Tunnel                     │
                                        (kubectl port-forward)                  │
                                                                                │
┌───────────────────────────────────────────────────────────────────────────────┼──────────┐
│                              MINIKUBE (Docker/VM)                             │          │
├───────────────────────────────────────────────────────────────────────────────┼──────────┤
│                                                                               │          │
│   ┌─────────────────────────────────────────────────────────────────────────┐ │          │
│   │              Namespace: ws-e-commerce-platform-abc123                   │ │          │
│   │                                                                         │ │          │
│   │   ┌─────────────────┐                                                   │ │          │
│   │   │ frontend-svc    │◄──────────────────────────────────────────────────┼─┘          │
│   │   │ ClusterIP:3000  │                                                   │            │
│   │   │        │        │                                                   │            │
│   │   │        ▼        │                                                   │            │
│   │   │  ┌──────────┐   │     ┌──────────┐     ┌──────────┐                 │            │
│   │   │  │ frontend │   │     │ backend  │     │ database │                 │            │
│   │   │  │   pod    │───┼────▶│   pod    │────▶│   pod    │                 │            │
│   │   │  └──────────┘   │     └──────────┘     └──────────┘                 │            │
│   │   └─────────────────┘                                                   │            │
│   │                                                                         │            │
│   └─────────────────────────────────────────────────────────────────────────┘            │
│                                                                                          │
│   ┌─────────────────────────────────────────────────────────────────────────┐            │
│   │              Namespace: ws-blog-platform-def456                         │            │
│   │                              ...                                        │            │
│   └─────────────────────────────────────────────────────────────────────────┘            │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

## Resource Lifecycle Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────────┐
│   User      │     │  Catalog    │     │  Terraform  │     │      Kubernetes             │
│   Action    │     │  Backend    │     │  Service    │     │                             │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────────────┬──────────────┘
       │                   │                   │                           │
       │  POST /workspaces │                   │                           │
       │  {slug: "ecomm"}  │                   │                           │
       │──────────────────▶│                   │                           │
       │                   │                   │                           │
       │                   │  Create DB entry  │                           │
       │                   │  status=PROVISION │                           │
       │                   │────────┐          │                           │
       │                   │        │          │                           │
       │                   │◀───────┘          │                           │
       │                   │                   │                           │
       │                   │  provision_       │                           │
       │                   │  workspace()      │                           │
       │                   │──────────────────▶│                           │
       │                   │                   │                           │
       │                   │                   │  1. Build Docker images   │
       │                   │                   │─────────────────────────▶ │
       │                   │                   │                           │
       │                   │                   │  2. Create namespace      │
       │                   │                   │     ws-{slug}-{id}        │
       │                   │                   │─────────────────────────▶ │
       │                   │                   │                           │
       │                   │                   │  3. Helm install          │
       │                   │                   │     universal-app         │
       │                   │                   │─────────────────────────▶ │
       │                   │                   │                           │
       │                   │                   │                    ┌──────┴───────┐
       │                   │                   │                    │ Creates:     │
       │                   │                   │                    │ - Deployments│
       │                   │                   │                    │ - Services   │
       │                   │                   │                    │ - Ingress    │
       │                   │                   │                    │ - ConfigMaps │
       │                   │                   │                    └──────┬───────┘
       │                   │                   │                           │
       │                   │                   │  4. Setup port-forward    │
       │                   │                   │─────────────────────────▶ │
       │                   │                   │                           │
       │                   │                   │  5. Update /etc/hosts     │
       │                   │────────┐          │                           │
       │                   │        │          │                           │
       │                   │◀───────┘          │                           │
       │                   │                   │                           │
       │                   │  Update DB entry  │                           │
       │                   │  status=RUNNING   │                           │
       │                   │  access_url=...   │                           │
       │                   │────────┐          │                           │
       │                   │        │          │                           │
       │  202 Accepted     │◀───────┘          │                           │
       │◀──────────────────│                   │                           │
       │                   │                   │                           │
```

## Workspace Status States

```
                                    ┌──────────────────┐
                                    │                  │
                                    │   PROVISIONING   │
                                    │  (Building imgs, │
                                    │   deploying)     │
                                    │                  │
                                    └────────┬─────────┘
                                             │
                          ┌──────────────────┼──────────────────┐
                          │                  │                  │
                          ▼                  ▼                  │
                 ┌────────────────┐ ┌────────────────┐          │
                 │                │ │                │          │
                 │    RUNNING     │ │     FAILED     │          │
                 │  (All pods up, │ │  (Build/deploy │          │
                 │   accessible)  │ │   error)       │          │
                 │                │ │                │          │
                 └───────┬────────┘ └────────────────┘          │
                         │                                      │
                         │  User clicks "Destroy"               │
                         ▼                                      │
                 ┌────────────────┐                             │
                 │                │                             │
                 │   DESTROYING   │                             │
                 │  (Scaling down │                             │
                 │   pods, cleanup)                             │
                 │                │                             │
                 └───────┬────────┘                             │
                         │                                      │
                         ▼                                      │
                 ┌────────────────┐                             │
                 │                │                             │
                 │   DESTROYED    │◀────────────────────────────┘
                 │  (Namespace    │     (Re-deploy same app)
                 │   deleted)     │
                 │                │
                 └────────────────┘
```

## Directory Structure

```
self-service-catalog/
├── apps/                          # Application definitions
│   ├── ecommerce/
│   │   ├── app-manifest.json      # App topology definition
│   │   ├── frontend/Dockerfile
│   │   └── api-server/Dockerfile
│   ├── blog-platform/
│   └── social-platform/
│
├── catalog-backend/               # FastAPI backend
│   ├── app/
│   │   ├── main.py               # Application entry point
│   │   ├── database.py           # SQLAlchemy setup
│   │   ├── models.py             # Database models
│   │   ├── routers/              # API endpoints
│   │   │   ├── catalog.py        # Catalog CRUD
│   │   │   └── workspaces.py     # Workspace management
│   │   └── services/
│   │       └── terraform_service.py  # Provisioning logic
│   └── requirements.txt
│
├── catalog-ui/                    # Next.js frontend
│   ├── src/
│   │   ├── app/                  # App router pages
│   │   ├── components/           # React components
│   │   └── lib/                  # API client, types
│   └── package.json
│
├── infrastructure/                # IaC definitions
│   ├── helm-charts/
│   │   └── universal-app/        # Generic Helm chart
│   │       ├── Chart.yaml
│   │       ├── values.yaml
│   │       └── templates/
│   │           ├── deployment.yaml
│   │           ├── service.yaml
│   │           ├── ingress.yaml
│   │           └── database.yaml
│   └── terraform/
│       └── app-deployer/         # Terraform module
│           ├── main.tf
│           ├── variables.tf
│           └── providers.tf
│
├── placeholder-apps/              # Default images for testing
│   ├── frontend/                 # Nginx-based placeholder
│   ├── backend/                  # Flask-based placeholder
│   └── worker/                   # Flask-based placeholder
│
├── setup.sh                      # One-time setup (requires sudo)
├── start.sh                      # Start platform (no sudo)
├── stop.sh                       # Stop platform (preserves state)
└── cleanup.sh                    # Full cleanup (requires sudo)
```

## Core Components

### 1. App Manifest (`app-manifest.json`)

The app manifest is the declarative contract that defines an application's topology.

```json
{
  "appName": "E-Commerce Platform",
  "description": "Full-stack e-commerce application",
  "components": [
    {
      "name": "web-ui",
      "type": "frontend",
      "path": "./frontend",
      "port": 3000
    },
    {
      "name": "api-server",
      "type": "backend",
      "path": "./api-server",
      "port": 8080
    },
    {
      "name": "database",
      "type": "database",
      "port": 5432
    }
  ]
}
```

**Design Decision**: Using JSON over YAML for manifests because:
- Better TypeScript integration
- Stricter parsing (no implicit type coercion)
- Native support in both Python and Node.js

### 2. Catalog Backend (FastAPI)

**Technology Choice**: FastAPI over Flask/Django because:
- Native async support for long-running Terraform operations
- Automatic OpenAPI documentation
- Type hints with Pydantic validation
- High performance with minimal boilerplate

**Key Features**:
- Catalog sync from filesystem (`/api/v1/catalog/sync`)
- Workspace lifecycle management (create, list, destroy)
- Background task processing for async provisioning
- Automatic image building and registry management

**Database Schema**:
```
┌─────────────────────┐     ┌─────────────────────────┐
│    app_catalog      │     │   workspace_instance    │
├─────────────────────┤     ├─────────────────────────┤
│ id (UUID, PK)       │◄────│ catalog_id (FK)         │
│ name                │     │ id (UUID, PK)           │
│ slug (unique)       │     │ status (enum)           │
│ description         │     │ access_url              │
│ manifest_payload    │     │ created_at              │
│ is_active           │     │ updated_at              │
│ created_at          │     └─────────────────────────┘
│ updated_at          │
└─────────────────────┘
```

### 3. Universal Helm Chart

**Design Goal**: Deploy any microservice topology without custom Helm code.

**Key Features**:
- Dynamic deployment generation using `range`
- Conditional ingress for frontend components
- Built-in PostgreSQL StatefulSet
- Configurable resource limits and health checks

**Values Interface**:
```yaml
global:
  appName: "my-app"
  imageRegistry: "localhost:5000"

components:
  - name: "frontend"
    image: "localhost:5000/my-app-frontend:latest"
    port: 3000
    type: "frontend"  # Creates ingress
  - name: "api"
    port: 8080
    type: "backend"   # ClusterIP only

databases:
  simplePostgresql:
    enabled: true
```

**Design Decision**: Single chart vs multiple charts:
- Chose single universal chart to reduce operational complexity
- Uses Helm's templating to generate N deployments from 1 template
- Trade-off: Less flexibility, but much simpler to maintain

### 4. Terraform Provisioner

**Role**: Bridge between the Catalog API and Kubernetes/Helm.

**Flow**:
```
JSON Manifest → Terraform Variables → Helm Values → Kubernetes Resources
```

**Key Functions**:
1. **Image Building**: Automatically builds/pushes Docker images
2. **Minikube Integration**: Loads images directly into minikube
3. **Namespace Isolation**: Each workspace gets `ws-{id}` namespace
4. **Local Access**: Manages port-forwards and DNS entries

**Design Decision**: Terraform over direct Helm CLI:
- State management for tracking deployed resources
- Declarative destroy operations
- Future extensibility for cloud resources (RDS, S3, etc.)

### 5. Catalog UI (Next.js 14)

**Technology Choice**: Next.js App Router because:
- Server components for faster initial load
- Built-in API routes (if needed)
- Excellent TypeScript support
- Modern React patterns (Server Actions, Suspense)

**Key Features**:
- App catalog browsing
- One-click deployment ("Spin Up")
- Workspace status monitoring
- Settings page with "Destroy All" capability

**State Management**: React Query (TanStack Query)
- Automatic background refetching
- Cache invalidation on mutations
- Loading and error states

## Design Decisions

### 1. One Workspace Per App

**Decision**: Allow only one active workspace per application.

**Rationale**:
- Simplifies mental model for developers
- Avoids ingress host conflicts
- Reduces resource consumption
- Easier DNS management

**Implementation**: On "Spin Up", destroy existing workspace first.

### 2. Automatic Image Building

**Decision**: Build images on-demand during deployment.

**Rationale**:
- No pre-requisite CI/CD pipeline needed
- Instant deployment from source
- Falls back to placeholders if no Dockerfile

**Flow**:
```
1. Check if image exists in registry
2. If Dockerfile exists → build from app
3. If build fails → use placeholder
4. For databases → use postgres:15-alpine
5. Push to registry + load into minikube
```

### 3. Local DNS via /etc/hosts

**Decision**: Use `/etc/hosts` for local `.local` domains.

**Rationale**:
- Works without external DNS server
- Predictable domain names (app-name.local)
- One-time setup (via `setup.sh`)

**Alternative Considered**: minikube tunnel + nip.io
- Rejected due to complexity and reliability issues

### 4. Port-Forward Management

**Decision**: Automatic port allocation starting at 3001.

**Rationale**:
- Port 3000 reserved for Catalog UI
- Each app gets unique port (3001, 3002, ...)
- Stored in `port_mappings.json` for persistence

### 5. Background Task Processing

**Decision**: FastAPI BackgroundTasks over Celery/Redis.

**Rationale**:
- No additional infrastructure needed
- Sufficient for single-user/development use
- Easy to upgrade to Celery later if needed

## Security Considerations

### Current State (Development)
- No authentication/authorization
- Direct kubectl access assumed
- Sudo required for `/etc/hosts` (one-time)

### Production Recommendations
1. Add OIDC/OAuth2 authentication
2. Implement RBAC for workspace access
3. Use Kubernetes RBAC for namespace isolation
4. Move to external DNS (Route53, CloudDNS)
5. TLS termination at ingress level

## Scalability

### Current Limitations
- Single minikube node
- Local Docker registry
- File-based port mappings

### Scaling Path
1. **Multi-node**: Switch to managed Kubernetes (EKS, GKE)
2. **Registry**: Use ECR, GCR, or Harbor
3. **State**: Move to PostgreSQL for all state
4. **Queue**: Add Redis + Celery for background jobs

## Future Enhancements

### Planned
- [ ] Application logs streaming
- [ ] Resource usage metrics
- [ ] Custom domain support
- [ ] Environment variables UI
- [ ] Deployment history

### Potential
- [ ] GitHub/GitLab integration
- [ ] CI/CD pipeline generation
- [ ] Cost estimation
- [ ] Multi-cluster support
- [ ] Secrets management (Vault integration)

## Troubleshooting

### Common Issues

**ImagePullBackOff**
```bash
# Images not in minikube - reload them
minikube image load localhost:5000/app-name:latest
kubectl rollout restart deployment -n ws-{id}
```

**Port-forward dies**
```bash
# Restart manually
kubectl port-forward -n ws-{id} svc/app-name 3001:3000
```

**Ingress conflict**
```bash
# Delete old namespace first
kubectl delete ns ws-{old-id}
```

**DNS not resolving**
```bash
# Re-run setup
./setup.sh
```

## References

- [Helm Chart Best Practices](https://helm.sh/docs/chart_best_practices/)
- [Terraform Kubernetes Provider](https://registry.terraform.io/providers/hashicorp/kubernetes/latest)
- [FastAPI Background Tasks](https://fastapi.tiangolo.com/tutorial/background-tasks/)
- [Next.js App Router](https://nextjs.org/docs/app)

