"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Search, Sparkles, AlertCircle } from "lucide-react";
import { getCatalog, syncCatalog, getWorkspaces } from "@/lib/api";
import { AppCard } from "@/components/catalog/AppCard";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function CatalogPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data: catalog,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["catalog"],
    queryFn: getCatalog,
  });

  const { data: workspaces } = useQuery({
    queryKey: ["workspaces"],
    queryFn: getWorkspaces,
    refetchInterval: 5000, // Poll for status updates
  });

  const handleSync = async () => {
    await syncCatalog();
    refetch();
  };

  const filteredCatalog = catalog?.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (
      item.slug.toLowerCase().includes(query) ||
      item.manifest_payload.appName.toLowerCase().includes(query) ||
      item.manifest_payload.description.toLowerCase().includes(query)
    );
  });

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/25">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">App Catalog</h1>
            <p className="text-sm text-muted-foreground">
              Discover and deploy application blueprints
            </p>
          </div>
        </div>
      </div>

      {/* Actions bar */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between animate-fade-in stagger-1" style={{ animationFillMode: "forwards", opacity: 0 }}>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search blueprints..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-lg border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
          />
        </div>
        <Button onClick={handleSync} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Sync Catalog
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-52 rounded-xl bg-card animate-pulse border border-border/50"
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Failed to load catalog</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Make sure the backend is running on port 8000
          </p>
          <Button onClick={() => refetch()} variant="outline">
            Try again
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && filteredCatalog?.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No blueprints found</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {searchQuery
              ? "Try adjusting your search query"
              : "Click 'Sync Catalog' to discover app blueprints"}
          </p>
          {!searchQuery && (
            <Button onClick={handleSync} variant="glow" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Sync Catalog
            </Button>
          )}
        </div>
      )}

      {/* Catalog grid */}
      {!isLoading && !error && filteredCatalog && filteredCatalog.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCatalog.map((item, index) => (
            <AppCard key={item.id} item={item} index={index} workspaces={workspaces} />
          ))}
        </div>
      )}
    </div>
  );
}

