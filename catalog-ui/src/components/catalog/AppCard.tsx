"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Layout,
  Server,
  Cog,
  Database,
  ArrowRight,
  Layers,
  Rocket,
  Trash2,
  CheckCircle2,
  Loader2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Hammer,
  Package,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConfirmationDialog } from "@/components/modals/ConfirmationDialog";
import { BuildStatus, CatalogItem, ComponentType, Workspace, WorkspaceStatus } from "@/lib/types";
import { buildAppImages, createWorkspace, deleteWorkspace } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AppCardProps {
  item: CatalogItem;
  index: number;
  workspaces?: Workspace[];
}

const componentIcons: Record<ComponentType, typeof Layout> = {
  frontend: Layout,
  backend: Server,
  worker: Cog,
  database: Database,
};

const componentStyles: Record<ComponentType, { icon: string; bg: string; text: string }> = {
  frontend: {
    icon: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20",
    text: "text-sky-700 dark:text-sky-300",
  },
  backend: {
    icon: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  worker: {
    icon: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20",
    text: "text-amber-700 dark:text-amber-300",
  },
  database: {
    icon: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20",
    text: "text-violet-700 dark:text-violet-300",
  },
};

const statusConfig: Record<
  WorkspaceStatus,
  { icon: typeof CheckCircle2; color: string; bgColor: string; label: string; animate?: boolean }
> = {
  PROVISIONING: {
    icon: Loader2,
    color: "text-blue-700 dark:text-blue-300",
    bgColor: "bg-blue-50 dark:bg-blue-500/20 border-blue-300 dark:border-blue-500/30",
    label: "Provisioning",
    animate: true,
  },
  RUNNING: {
    icon: CheckCircle2,
    color: "text-emerald-700 dark:text-emerald-300",
    bgColor: "bg-emerald-50 dark:bg-emerald-500/20 border-emerald-300 dark:border-emerald-500/30",
    label: "Running",
  },
  DESTROYING: {
    icon: Loader2,
    color: "text-orange-700 dark:text-orange-300",
    bgColor: "bg-orange-50 dark:bg-orange-500/20 border-orange-300 dark:border-orange-500/30",
    label: "Destroying",
    animate: true,
  },
  FAILED: {
    icon: XCircle,
    color: "text-red-700 dark:text-red-300",
    bgColor: "bg-red-50 dark:bg-red-500/20 border-red-300 dark:border-red-500/30",
    label: "Failed",
  },
  DESTROYED: {
    icon: AlertTriangle,
    color: "text-gray-700 dark:text-gray-300",
    bgColor: "bg-gray-50 dark:bg-gray-500/20 border-gray-300 dark:border-gray-500/30",
    label: "Destroyed",
  },
};

export function AppCard({ item, index, workspaces = [] }: AppCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isHovered, setIsHovered] = useState(false);
  const [spinUpDialogOpen, setSpinUpDialogOpen] = useState(false);
  const [destroyDialogOpen, setDestroyDialogOpen] = useState(false);

  const manifest = item.manifest_payload;
  const componentCounts = manifest.components.reduce(
    (acc, c) => {
      acc[c.type] = (acc[c.type] || 0) + 1;
      return acc;
    },
    {} as Record<ComponentType, number>
  );

  // Get workspaces for this app
  const appWorkspaces = workspaces.filter((w) => w.catalog_id === item.id);
  const activeWorkspaces = appWorkspaces.filter(
    (w) => w.status === "RUNNING" || w.status === "PROVISIONING" || w.status === "DESTROYING"
  );
  const runningWorkspace = appWorkspaces.find((w) => w.status === "RUNNING");
  const provisioningWorkspace = appWorkspaces.find((w) => w.status === "PROVISIONING");
  const destroyingWorkspace = appWorkspaces.find((w) => w.status === "DESTROYING");

  // Determine the primary status to show
  const primaryWorkspace = runningWorkspace || provisioningWorkspace;
  const primaryStatus = primaryWorkspace?.status;

  const deployMutation = useMutation({
    mutationFn: () => createWorkspace({ slug: item.slug }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setSpinUpDialogOpen(false);
    },
  });

  const destroyMutation = useMutation({
    mutationFn: (workspaceId: string) => deleteWorkspace(workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setDestroyDialogOpen(false);
    },
    onError: () => {
      setDestroyDialogOpen(false);
    },
  });

  const buildMutation = useMutation({
    mutationFn: () => buildAppImages(item.slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
  });

  const handleBuildClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    buildMutation.mutate();
  };

  const handleSpinUpClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSpinUpDialogOpen(true);
  };

  const handleSpinUpConfirm = () => {
    deployMutation.mutate();
  };

  const handleDestroyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDestroyDialogOpen(true);
  };

  const handleDestroyConfirm = () => {
    // Find the workspace to destroy - could be RUNNING or still showing after state update
    const workspaceToDestroy = appWorkspaces.find(
      (w) => w.status === "RUNNING" || w.status === "PROVISIONING"
    );
    
    if (workspaceToDestroy) {
      destroyMutation.mutate(workspaceToDestroy.id);
    } else {
      setDestroyDialogOpen(false);
    }
  };

  const handleStatusClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push("/workspaces");
  };

  const handleAccessClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (runningWorkspace?.access_url) {
      window.open(runningWorkspace.access_url, "_blank");
    }
  };

  const isLoading = deployMutation.isPending || destroyMutation.isPending || buildMutation.isPending;
  const hasActiveWorkspace = !!primaryStatus;
  const buildStatus = item.build_status || "NOT_BUILT";
  const isBuilt = buildStatus === "BUILT";
  const isBuilding = buildStatus === "BUILDING" || buildMutation.isPending;

  return (
    <>
      <Link href={`/apps/${item.slug}`}>
        <Card
          className={cn(
            "group relative cursor-pointer transition-all duration-300 animate-slide-up opacity-0 h-[280px] flex flex-col",
            hasActiveWorkspace 
              ? "border-2 border-emerald-300 dark:border-emerald-500/50 shadow-lg shadow-emerald-100 dark:shadow-emerald-500/10 bg-gradient-to-br from-emerald-50/50 to-white dark:from-emerald-500/5 dark:to-background" 
              : "border border-slate-200 dark:border-slate-700/50 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5",
            `stagger-${(index % 5) + 1}`
          )}
          style={{ animationFillMode: "forwards" }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Gradient overlay on hover */}
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

          <CardHeader className="relative pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg ring-1",
                  hasActiveWorkspace 
                    ? "bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-500/20 dark:to-emerald-600/10 ring-emerald-300 dark:ring-emerald-500/30"
                    : "bg-gradient-to-br from-slate-100 to-slate-50 dark:from-cyan-500/20 dark:to-blue-600/20 ring-slate-200 dark:ring-cyan-500/30"
                )}>
                  <Layers className={cn(
                    "h-5 w-5",
                    hasActiveWorkspace ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600 dark:text-cyan-400"
                  )} />
                </div>
                <div>
                  <CardTitle className={cn(
                    "text-base font-semibold transition-colors",
                    hasActiveWorkspace ? "text-emerald-700 dark:text-emerald-300" : "group-hover:text-primary"
                  )}>
                    {manifest.appName}
                  </CardTitle>
                  <p className="text-[10px] font-mono text-slate-500 dark:text-muted-foreground">
                    {item.slug}
                  </p>
                </div>
              </div>
              
              {/* Status chip or arrow */}
              {primaryStatus ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleStatusClick}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all hover:scale-105",
                        statusConfig[primaryStatus].bgColor,
                        statusConfig[primaryStatus].color
                      )}
                    >
                      {(() => {
                        const Icon = statusConfig[primaryStatus].icon;
                        return (
                          <Icon
                            className={cn(
                              "h-3.5 w-3.5",
                              statusConfig[primaryStatus].animate && "animate-spin"
                            )}
                          />
                        );
                      })()}
                      {activeWorkspaces.length > 1
                        ? `${activeWorkspaces.length} Active`
                        : statusConfig[primaryStatus].label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>Click to view workspaces</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <ArrowRight className="h-4 w-4 text-slate-400 dark:text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-2 transition-all" />
              )}
            </div>
          </CardHeader>

          <CardContent className="relative space-y-4 flex-1 flex flex-col">
            {/* Description with fixed 2-line height and ellipsis */}
            <p className="text-sm text-slate-600 dark:text-muted-foreground line-clamp-2 min-h-[40px]">
              {manifest.description}
            </p>

            {/* Component breakdown */}
            <div className="flex flex-wrap gap-2">
              {(Object.entries(componentCounts) as [ComponentType, number][]).map(
                ([type, count]) => {
                  const Icon = componentIcons[type];
                  const styles = componentStyles[type];
                  return (
                    <div
                      key={type}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2.5 py-1",
                        styles.bg
                      )}
                    >
                      <Icon className={cn("h-3.5 w-3.5", styles.icon)} />
                      <span className={cn("text-[11px] font-medium capitalize", styles.text)}>
                        {count} {type}
                      </span>
                    </div>
                  );
                }
              )}
            </div>

            {/* Spacer to push actions to bottom */}
            <div className="flex-1" />

            {/* Actions */}
            <div className="flex items-center gap-2 pt-3 border-t border-slate-200 dark:border-border/50">
              {destroyingWorkspace ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 text-xs gap-1.5 font-medium border-orange-300 dark:border-orange-500/50"
                  disabled
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-600" />
                  <span className="text-orange-600 dark:text-orange-400">Destroying...</span>
                </Button>
              ) : runningWorkspace ? (
                <>
                  {/* Access button when running */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-9 text-xs gap-1.5 font-medium border-emerald-300 dark:border-emerald-500/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/20 hover:border-emerald-400 dark:hover:border-emerald-400/60"
                    onClick={handleAccessClick}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open App
                  </Button>

                  {/* Destroy button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-9 w-9 p-0"
                        onClick={handleDestroyClick}
                        disabled={isLoading}
                      >
                        {destroyMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>Destroy workspace</p>
                    </TooltipContent>
                  </Tooltip>
                </>
              ) : provisioningWorkspace ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 text-xs gap-1.5 font-medium"
                  disabled
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                  <span className="text-blue-600 dark:text-blue-400">Provisioning...</span>
                </Button>
              ) : (
                <div className="flex items-center gap-2 flex-1">
                  {/* Build button - show when not built */}
                  {!isBuilt && (
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-9 text-xs gap-1.5 font-medium",
                        isBuilding 
                          ? "border-amber-300 dark:border-amber-500/50" 
                          : "border-violet-300 dark:border-violet-500/50 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/20"
                      )}
                      onClick={handleBuildClick}
                      disabled={isBuilding}
                    >
                      {isBuilding ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                          <span className="text-amber-600 dark:text-amber-400">Building...</span>
                        </>
                      ) : (
                        <>
                          <Hammer className="h-3.5 w-3.5" />
                          Build
                        </>
                      )}
                    </Button>
                  )}
                  
                  {/* Built badge */}
                  {isBuilt && !deployMutation.isPending && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
                          <Package className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">Built</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p>Images pre-built and ready</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  
                  {/* Spin Up button */}
                  <Button
                    size="sm"
                    className="flex-1 h-9 text-xs gap-1.5 font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border-0 shadow-md shadow-cyan-500/20 hover:shadow-lg hover:shadow-cyan-500/30 transition-all"
                    onClick={handleSpinUpClick}
                    disabled={isLoading}
                  >
                    {deployMutation.isPending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Deploying...
                      </>
                    ) : (
                      <>
                        <Rocket className="h-3.5 w-3.5" />
                        Spin Up
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* Confirmation Dialogs */}
      <ConfirmationDialog
        open={spinUpDialogOpen}
        onOpenChange={setSpinUpDialogOpen}
        onConfirm={handleSpinUpConfirm}
        isLoading={deployMutation.isPending}
        type="spinup"
        appName={manifest.appName}
        componentCount={manifest.components.length}
      />

      <ConfirmationDialog
        open={destroyDialogOpen}
        onOpenChange={setDestroyDialogOpen}
        onConfirm={handleDestroyConfirm}
        isLoading={destroyMutation.isPending}
        type="destroy"
        appName={manifest.appName}
      />
    </>
  );
}
