"use client";

import {
  Rocket,
  Trash2,
  Loader2,
  AlertTriangle,
  Server,
  CheckCircle2,
  XCircle,
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
import { cn } from "@/lib/utils";

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading?: boolean;
  type: "spinup" | "destroy";
  appName: string;
  componentCount?: number;
}

const dialogConfig = {
  spinup: {
    icon: Rocket,
    iconBg: "bg-gradient-to-br from-cyan-500 to-blue-600",
    title: "Spin Up Workspace",
    buttonText: "Spin Up",
    buttonClass: "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border-0",
    loadingText: "Spinning Up...",
  },
  destroy: {
    icon: Trash2,
    iconBg: "bg-gradient-to-br from-red-500 to-rose-600",
    title: "Destroy Workspace",
    buttonText: "Destroy",
    buttonClass: "bg-red-600 hover:bg-red-700 text-white border-0",
    loadingText: "Destroying...",
  },
};

export function ConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
  type,
  appName,
  componentCount = 0,
}: ConfirmationDialogProps) {
  const config = dialogConfig[type];
  const Icon = config.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl shadow-lg",
              config.iconBg
            )}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            <span>{config.title}</span>
          </DialogTitle>
          <DialogDescription className="pt-2">
            {type === "spinup" 
              ? `You are about to create a new workspace for "${appName}".`
              : `You are about to destroy the workspace for "${appName}".`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {type === "spinup" ? (
            <>
              {/* What will happen - Spin Up */}
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-4">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300 mb-3">
                  <CheckCircle2 className="h-4 w-4" />
                  What will happen
                </h4>
                <ul className="space-y-2 text-sm text-emerald-600 dark:text-emerald-400">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>A new isolated workspace will be provisioned</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>{componentCount > 0 ? `${componentCount} component(s)` : "All components"} will be deployed</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>You'll get a unique access URL when ready</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>Provisioning typically takes 30-60 seconds</span>
                  </li>
                </ul>
              </div>

              {/* Resource notice */}
              <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-1">
                      Resource Notice
                    </h4>
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      This will allocate compute resources. Make sure to destroy the workspace when you're done to free up resources.
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* What will happen - Destroy */}
              <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-4">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300 mb-3">
                  <XCircle className="h-4 w-4" />
                  What will happen
                </h4>
                <ul className="space-y-2 text-sm text-red-600 dark:text-red-400">
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-1">•</span>
                    <span>All running containers will be stopped</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-1">•</span>
                    <span>Infrastructure resources will be deallocated</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-1">•</span>
                    <span>The workspace access URL will stop working</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-1">•</span>
                    <span>Any unsaved data in the workspace will be lost</span>
                  </li>
                </ul>
              </div>

              {/* Warning */}
              <div className="rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <Server className="h-5 w-5 text-slate-500 dark:text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-foreground mb-1">
                      Note
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-muted-foreground">
                      You can spin up a new workspace anytime from the catalog. This action cannot be undone.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            className={cn("gap-2", config.buttonClass)}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {config.loadingText}
              </>
            ) : (
              <>
                <Icon className="h-4 w-4" />
                {config.buttonText}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

