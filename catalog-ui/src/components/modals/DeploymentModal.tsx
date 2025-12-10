"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  Rocket,
  Loader2,
  CheckCircle2,
  Layout,
  Server,
  Cog,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createWorkspace } from "@/lib/api";
import { CatalogItem, ComponentType } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DeploymentModalProps {
  item: CatalogItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const componentIcons: Record<ComponentType, typeof Layout> = {
  frontend: Layout,
  backend: Server,
  worker: Cog,
};

const componentColors: Record<ComponentType, string> = {
  frontend: "text-cyan-400",
  backend: "text-emerald-400",
  worker: "text-amber-400",
};

export function DeploymentModal({
  item,
  open,
  onOpenChange,
}: DeploymentModalProps) {
  const router = useRouter();
  const [deploymentSuccess, setDeploymentSuccess] = useState(false);

  const deployMutation = useMutation({
    mutationFn: () => createWorkspace({ slug: item.slug }),
    onSuccess: () => {
      setDeploymentSuccess(true);
      setTimeout(() => {
        onOpenChange(false);
        router.push("/workspaces");
      }, 1500);
    },
  });

  const handleDeploy = () => {
    deployMutation.mutate();
  };

  const manifest = item.manifest_payload;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/25">
              <Rocket className="h-4 w-4 text-white" />
            </div>
            Deploy {manifest.appName}
          </DialogTitle>
          <DialogDescription>
            This will provision a new workspace with the following components.
          </DialogDescription>
        </DialogHeader>

        {deploymentSuccess ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 mb-4 animate-fade-in">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Deployment Started!</h3>
            <p className="text-sm text-muted-foreground">
              Redirecting to workspaces...
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-4">
              {/* Components summary */}
              <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Components to Deploy
                </h4>
                <div className="space-y-2">
                  {manifest.components.map((component) => {
                    const Icon = componentIcons[component.type];
                    return (
                      <div
                        key={component.name}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <Icon
                            className={cn(
                              "h-4 w-4",
                              componentColors[component.type]
                            )}
                          />
                          <span className="text-sm font-medium">
                            {component.name}
                          </span>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">
                          Port {component.port}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5" />
                <div className="text-xs text-amber-200">
                  <p className="font-medium mb-1">Resource Notice</p>
                  <p className="text-amber-200/80">
                    This will allocate compute resources. Ensure you have
                    sufficient quota.
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={deployMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="glow"
                onClick={handleDeploy}
                disabled={deployMutation.isPending}
                className="gap-2"
              >
                {deployMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" />
                    Confirm Deployment
                  </>
                )}
              </Button>
            </DialogFooter>

            {deployMutation.isError && (
              <div className="mt-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                Failed to deploy. Please try again.
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

