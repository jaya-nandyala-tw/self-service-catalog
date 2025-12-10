"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Rocket,
  Layout,
  Server,
  Cog,
  Database,
  GitBranch,
  Clock,
  AlertCircle,
  Loader2,
  Network,
  ExternalLink,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Boxes,
} from "lucide-react";
import { getCatalogItem, getWorkspaces, createWorkspace, deleteWorkspace } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AppTopology } from "@/components/topology/AppTopology";
import { DeploymentModal } from "@/components/modals/DeploymentModal";
import { ConfirmationDialog } from "@/components/modals/ConfirmationDialog";
import { ComponentType, WorkspaceStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const componentIcons: Record<ComponentType, typeof Layout> = {
  frontend: Layout,
  backend: Server,
  worker: Cog,
  database: Database,
};

const componentColors: Record<ComponentType, { bg: string; text: string; badge: string }> = {
  frontend: {
    bg: "bg-cyan-100 dark:bg-cyan-500/10",
    text: "text-cyan-600 dark:text-cyan-400",
    badge: "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-300 dark:border-cyan-500/30",
  },
  backend: {
    bg: "bg-emerald-100 dark:bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    badge: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/30",
  },
  worker: {
    bg: "bg-amber-100 dark:bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    badge: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/30",
  },
  database: {
    bg: "bg-violet-100 dark:bg-violet-500/10",
    text: "text-violet-600 dark:text-violet-400",
    badge: "bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-500/30",
  },
};

const statusConfig: Record<
  WorkspaceStatus,
  { icon: typeof CheckCircle2; color: string; bgColor: string; label: string; animate?: boolean }
> = {
  PROVISIONING: {
    icon: Loader2,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-500/20 border-blue-200 dark:border-blue-500/30",
    label: "Provisioning",
    animate: true,
  },
  RUNNING: {
    icon: CheckCircle2,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-100 dark:bg-emerald-500/20 border-emerald-200 dark:border-emerald-500/30",
    label: "Running",
  },
  FAILED: {
    icon: XCircle,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-500/20 border-red-200 dark:border-red-500/30",
    label: "Failed",
  },
  DESTROYED: {
    icon: AlertTriangle,
    color: "text-gray-600 dark:text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-500/20 border-gray-200 dark:border-gray-500/30",
    label: "Destroyed",
  },
};

export default function AppDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const slug = params.slug as string;
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [spinUpDialogOpen, setSpinUpDialogOpen] = useState(false);
  const [destroyDialogOpen, setDestroyDialogOpen] = useState(false);

  const {
    data: item,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["catalog", slug],
    queryFn: () => getCatalogItem(slug),
    enabled: !!slug,
  });

  const { data: workspaces } = useQuery({
    queryKey: ["workspaces"],
    queryFn: getWorkspaces,
    refetchInterval: 5000,
  });

  const deployMutation = useMutation({
    mutationFn: () => createWorkspace({ slug }),
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
  });

  // Get workspaces for this app
  const appWorkspaces = item
    ? workspaces?.filter((w) => w.catalog_id === item.id) ?? []
    : [];
  const activeWorkspaces = appWorkspaces.filter(
    (w) => w.status === "RUNNING" || w.status === "PROVISIONING"
  );
  const runningWorkspace = appWorkspaces.find((w) => w.status === "RUNNING");
  const provisioningWorkspace = appWorkspaces.find((w) => w.status === "PROVISIONING");

  const isLoading2 = deployMutation.isPending || destroyMutation.isPending;

  const handleSpinUpClick = () => {
    setSpinUpDialogOpen(true);
  };

  const handleSpinUpConfirm = () => {
    deployMutation.mutate();
  };

  const handleDestroyClick = () => {
    setDestroyDialogOpen(true);
  };

  const handleDestroyConfirm = () => {
    if (runningWorkspace) {
      destroyMutation.mutate(runningWorkspace.id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading blueprint...</p>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h3 className="text-lg font-semibold">Blueprint not found</h3>
          <p className="text-sm text-muted-foreground">
            The blueprint "{slug}" could not be found.
          </p>
          <Button onClick={() => router.push("/")} variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Catalog
          </Button>
        </div>
      </div>
    );
  }

  const manifest = item.manifest_payload;

  return (
    <div className="min-h-screen p-8 animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={() => router.push("/")}
          className="mb-4 -ml-2 gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Catalog
        </Button>

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/25">
              <Network className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{manifest.appName}</h1>
              <p className="text-sm font-mono text-muted-foreground mt-1">{item.slug}</p>
              <p className="text-muted-foreground mt-2 max-w-xl">{manifest.description}</p>
            </div>
          </div>

          {/* Action buttons - Toggle based on workspace state */}
          <div className="flex items-center gap-3 shrink-0">
            {runningWorkspace ? (
              <>
                {/* Open App button */}
                <Button
                  variant="outline"
                  size="lg"
                  className="gap-2"
                  onClick={() => window.open(runningWorkspace.access_url || "#", "_blank")}
                >
                  <ExternalLink className="h-5 w-5" />
                  Open App
                </Button>
                
                {/* Destroy button */}
                <Button
                  variant="outline"
                  size="lg"
                  className="gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive/50"
                  onClick={handleDestroyClick}
                  disabled={isLoading2}
                >
                  <Trash2 className="h-5 w-5" />
                  Destroy
                </Button>
              </>
            ) : provisioningWorkspace ? (
              <Button
                variant="outline"
                size="lg"
                className="gap-2"
                disabled
              >
                <Loader2 className="h-5 w-5 animate-spin" />
                Provisioning...
              </Button>
            ) : (
              <Button
                variant="glow"
                size="lg"
                onClick={handleSpinUpClick}
                disabled={isLoading2}
                className="gap-2"
              >
                <Rocket className="h-5 w-5" />
                Spin Up Workspace
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">
        {/* Left pane - Details */}
        <div className="xl:col-span-2 space-y-6">
          {/* Active Workspaces - Show only if there are any */}
          {activeWorkspaces.length > 0 && (
            <Card className="border-border/50 border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/20">
                    <Boxes className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  Active Instances
                  <Badge 
                    variant="secondary" 
                    className="ml-auto bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                  >
                    {activeWorkspaces.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {activeWorkspaces.map((workspace) => {
                  const config = statusConfig[workspace.status];
                  const StatusIcon = config.icon;
                  return (
                    <Link
                      key={workspace.id}
                      href="/workspaces"
                      className="group flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
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
                        <span className="text-xs font-mono text-muted-foreground">
                          {workspace.id.slice(0, 8)}...
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {workspace.access_url && workspace.status === "RUNNING" && (
                          <span className="text-xs text-primary group-hover:underline">
                            Open →
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
                <Link
                  href="/workspaces"
                  className="block text-center text-xs text-primary hover:underline pt-2"
                >
                  View all workspaces →
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Components List */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Server className="h-4 w-4 text-primary" />
                </div>
                Components
                <Badge variant="secondary" className="ml-auto">
                  {manifest.components.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {manifest.components.map((component) => {
                const Icon = componentIcons[component.type];
                const colors = componentColors[component.type];
                return (
                  <div
                    key={component.name}
                    className="group flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-lg", colors.bg)}>
                        <Icon className={cn("h-4 w-4", colors.text)} />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{component.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {component.path}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] capitalize font-medium", colors.badge)}
                      >
                        {component.type}
                      </Badge>
                      <Badge 
                        variant="secondary" 
                        className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                      >
                        :{component.port}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Dependencies */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-500/10">
                  <GitBranch className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                Dependencies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {manifest.components.some((c) => c.dependencies?.length) ? (
                  manifest.components
                    .filter((c) => c.dependencies?.length)
                    .map((component) => (
                      <div key={component.name} className="text-sm">
                        <span className="font-medium text-foreground">{component.name}</span>
                        <span className="text-muted-foreground"> → </span>
                        <span className="text-muted-foreground">
                          {component.dependencies?.join(", ")}
                        </span>
                      </div>
                    ))
                ) : (
                  <p className="text-sm text-muted-foreground">No inter-component dependencies</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/10">
                  <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                Metadata
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Created</span>
                <span className="font-mono text-xs">
                  {new Date(item.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Last Updated</span>
                <span className="font-mono text-xs">
                  {new Date(item.updated_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Repository</span>
                <span className="font-mono text-xs text-primary">{item.repo_path}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <Badge
                  variant={item.is_active ? "default" : "secondary"}
                  className={cn(
                    "text-[10px]",
                    item.is_active
                      ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/30"
                      : ""
                  )}
                >
                  {item.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right pane - Topology Graph */}
        <div className="xl:col-span-3">
          <Card className="border-border/50 h-[600px]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-100 dark:from-cyan-500/20 to-purple-100 dark:to-purple-500/20">
                  <Network className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                </div>
                Architecture Topology
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[calc(100%-4rem)] p-0 px-6 pb-6">
              <AppTopology components={manifest.components} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Deployment Modal */}
      <DeploymentModal
        item={item}
        open={deployModalOpen}
        onOpenChange={setDeployModalOpen}
      />

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
    </div>
  );
}
