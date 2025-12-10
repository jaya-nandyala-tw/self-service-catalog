"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  RefreshCw,
  Loader2,
  AlertCircle,
  ExternalLink,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { getWorkspaces, getCatalog, deleteWorkspace } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WorkspaceStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import Link from "next/link";

const statusConfig: Record<
  WorkspaceStatus,
  { icon: typeof CheckCircle2; color: string; bgColor: string; label: string; animate?: boolean }
> = {
  PROVISIONING: {
    icon: Loader2,
    color: "text-blue-400",
    bgColor: "bg-blue-500/20 border-blue-500/30",
    label: "Provisioning",
    animate: true,
  },
  RUNNING: {
    icon: CheckCircle2,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/20 border-emerald-500/30",
    label: "Running",
  },
  DESTROYING: {
    icon: Loader2,
    color: "text-orange-400",
    bgColor: "bg-orange-500/20 border-orange-500/30",
    label: "Destroying",
    animate: true,
  },
  FAILED: {
    icon: XCircle,
    color: "text-red-400",
    bgColor: "bg-red-500/20 border-red-500/30",
    label: "Failed",
  },
  DESTROYED: {
    icon: AlertTriangle,
    color: "text-gray-400",
    bgColor: "bg-gray-500/20 border-gray-500/30",
    label: "Destroyed",
  },
};

export default function WorkspacesPage() {
  const queryClient = useQueryClient();

  const {
    data: workspaces,
    isLoading: workspacesLoading,
    error: workspacesError,
    refetch,
  } = useQuery({
    queryKey: ["workspaces"],
    queryFn: getWorkspaces,
    refetchInterval: 5000, // Poll every 5 seconds for status updates
  });

  const { data: catalog } = useQuery({
    queryKey: ["catalog"],
    queryFn: getCatalog,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });

  // Create a map of catalog items by ID for quick lookup
  const catalogMap = new Map(catalog?.map((item) => [item.id, item]) ?? []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return "Just now";
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 shadow-lg shadow-purple-500/25">
              <Boxes className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">My Workspaces</h1>
              <p className="text-sm text-muted-foreground">
                Manage your deployed application instances
              </p>
            </div>
          </div>
          <Button onClick={() => refetch()} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      {workspaces && workspaces.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8 animate-fade-in stagger-1" style={{ animationFillMode: "forwards", opacity: 0 }}>
          {(["RUNNING", "PROVISIONING", "DESTROYING", "FAILED", "DESTROYED"] as WorkspaceStatus[]).map(
            (status) => {
              const config = statusConfig[status];
              const count = workspaces.filter((w) => w.status === status).length;
              const Icon = config.icon;
              return (
                <div
                  key={status}
                  className="p-4 rounded-xl border border-border/50 bg-card/50"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={cn("h-4 w-4", config.color, config.animate && "animate-spin")} />
                    <span className="text-sm font-medium text-muted-foreground">
                      {config.label}
                    </span>
                  </div>
                  <p className="text-2xl font-bold">{count}</p>
                </div>
              );
            }
          )}
        </div>
      )}

      {/* Loading state */}
      {workspacesLoading && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">Loading workspaces...</p>
        </div>
      )}

      {/* Error state */}
      {workspacesError && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Failed to load workspaces</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Make sure the backend is running on port 8000
          </p>
          <Button onClick={() => refetch()} variant="outline">
            Try again
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!workspacesLoading && !workspacesError && workspaces?.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
            <Boxes className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No workspaces yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Deploy an app from the catalog to create your first workspace
          </p>
          <Link href="/">
            <Button variant="glow" className="gap-2">
              Browse Catalog
            </Button>
          </Link>
        </div>
      )}

      {/* Workspaces table */}
      {!workspacesLoading && !workspacesError && workspaces && workspaces.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden animate-fade-in stagger-2" style={{ animationFillMode: "forwards", opacity: 0 }}>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Instance
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Blueprint
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Created
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Access URL
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspaces.map((workspace, index) => {
                const catalogItem = catalogMap.get(workspace.catalog_id);
                const config = statusConfig[workspace.status];
                const StatusIcon = config.icon;

                return (
                  <TableRow
                    key={workspace.id}
                    className={cn(
                      "border-border/50 hover:bg-muted/30 transition-colors animate-slide-up opacity-0",
                      `stagger-${(index % 5) + 1}`
                    )}
                    style={{ animationFillMode: "forwards" }}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">
                          {catalogItem?.manifest_payload.appName ?? "Unknown"}-
                          {workspace.id.slice(0, 8)}
                        </p>
                        <p className="text-[10px] font-mono text-muted-foreground">
                          {workspace.id}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {catalogItem ? (
                        <Link
                          href={`/apps/${catalogItem.slug}`}
                          className="text-sm text-primary hover:underline"
                        >
                          {catalogItem.slug}
                        </Link>
                      ) : (
                        <span className="text-sm text-muted-foreground">Unknown</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-medium gap-1.5",
                          config.bgColor,
                          config.color
                        )}
                      >
                        <StatusIcon
                          className={cn("h-3 w-3", config.animate && "animate-spin")}
                        />
                        {config.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-default">
                            <Clock className="h-3.5 w-3.5" />
                            {getTimeAgo(workspace.created_at)}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {formatDate(workspace.created_at)}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      {workspace.access_url && workspace.status === "RUNNING" ? (
                        <a
                          href={workspace.access_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteMutation.mutate(workspace.id)}
                            disabled={
                              deleteMutation.isPending ||
                              workspace.status === "DESTROYED" ||
                              workspace.status === "DESTROYING"
                            }
                          >
                            {deleteMutation.isPending || workspace.status === "DESTROYING" ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {workspace.status === "DESTROYING" ? "Destroying..." : "Destroy workspace"}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

