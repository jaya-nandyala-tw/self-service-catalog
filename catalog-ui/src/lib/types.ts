// ============================================================================
// API Types - Must match Backend
// ============================================================================

export type ComponentType = "frontend" | "backend" | "worker" | "database";

export interface Component {
  name: string;
  type: ComponentType;
  path: string;
  port: number;
  dependencies?: string[];
}

export interface AppManifest {
  appName: string;
  description: string;
  components: Component[];
}

export interface CatalogItem {
  id: string;
  slug: string;
  repo_path: string;
  manifest_payload: AppManifest;
  is_active: boolean;
  build_status: BuildStatus;
  created_at: string;
  updated_at: string;
}

export type WorkspaceStatus = "PROVISIONING" | "RUNNING" | "DESTROYING" | "FAILED" | "DESTROYED";

export type BuildStatus = "NOT_BUILT" | "BUILDING" | "BUILT" | "FAILED";

export interface Workspace {
  id: string;
  catalog_id: string;
  status: WorkspaceStatus;
  access_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceWithCatalog extends Workspace {
  catalog?: CatalogItem;
}

// ============================================================================
// Request Types
// ============================================================================

export interface CreateWorkspaceRequest {
  slug: string;
}

