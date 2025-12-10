import axios, { AxiosInstance } from "axios";
import {
  CatalogItem,
  CreateWorkspaceRequest,
  Workspace,
} from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Create axios instance with default config
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

// ============================================================================
// Catalog API
// ============================================================================

export async function getCatalog(): Promise<CatalogItem[]> {
  const response = await apiClient.get<CatalogItem[]>("/api/v1/catalog");
  return response.data;
}

export async function getCatalogItem(slug: string): Promise<CatalogItem> {
  const response = await apiClient.get<CatalogItem>(`/api/v1/catalog/${slug}`);
  return response.data;
}

export async function syncCatalog(): Promise<{ status: string; message: string }> {
  const response = await apiClient.post("/api/v1/catalog/sync");
  return response.data;
}

export async function buildAppImages(slug: string): Promise<{ status: string; message: string; slug: string }> {
  const response = await apiClient.post(`/api/v1/catalog/${slug}/build`);
  return response.data;
}

// ============================================================================
// Workspaces API
// ============================================================================

export async function getWorkspaces(): Promise<Workspace[]> {
  const response = await apiClient.get<Workspace[]>("/api/v1/workspaces");
  return response.data;
}

export async function getWorkspace(id: string): Promise<Workspace> {
  const response = await apiClient.get<Workspace>(`/api/v1/workspaces/${id}`);
  return response.data;
}

export async function createWorkspace(
  data: CreateWorkspaceRequest
): Promise<Workspace> {
  const response = await apiClient.post<Workspace>("/api/v1/workspaces", data);
  return response.data;
}

export async function deleteWorkspace(id: string): Promise<void> {
  await apiClient.delete(`/api/v1/workspaces/${id}`);
}

export interface DestroyAllResponse {
  status: string;
  message: string;
}

export async function destroyAll(): Promise<DestroyAllResponse> {
  const response = await apiClient.delete<DestroyAllResponse>(
    "/api/v1/workspaces?confirm=true"
  );
  return response.data;
}

export { apiClient };

