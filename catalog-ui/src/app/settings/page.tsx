"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings,
  Server,
  Bell,
  Palette,
  Shield,
  Code,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { destroyAll, syncCatalog } from "@/lib/api";

const settingsSections = [
  {
    title: "API Configuration",
    description: "Configure backend API connection settings",
    icon: Server,
    color: "from-cyan-500 to-blue-600",
    items: [
      { label: "API Endpoint", value: "http://localhost:8000", type: "endpoint" },
      { label: "Timeout", value: "30s", type: "config" },
      { label: "Status", value: "Connected", type: "status", ok: true },
    ],
  },
  {
    title: "Notifications",
    description: "Manage notification preferences",
    icon: Bell,
    color: "from-amber-500 to-orange-600",
    items: [
      { label: "Deployment Alerts", value: "Enabled", type: "toggle", ok: true },
      { label: "Status Updates", value: "Enabled", type: "toggle", ok: true },
      { label: "Email Notifications", value: "Disabled", type: "toggle", ok: false },
    ],
  },
  {
    title: "Appearance",
    description: "Customize the look and feel",
    icon: Palette,
    color: "from-purple-500 to-pink-600",
    items: [
      { label: "Theme", value: "Dark", type: "config" },
      { label: "Accent Color", value: "Cyan", type: "config" },
      { label: "Font", value: "Sora", type: "config" },
    ],
  },
  {
    title: "Security",
    description: "Authentication and access control",
    icon: Shield,
    color: "from-emerald-500 to-teal-600",
    items: [
      { label: "Authentication", value: "Disabled", type: "status", ok: false },
      { label: "RBAC", value: "Coming Soon", type: "badge" },
      { label: "Audit Logs", value: "Coming Soon", type: "badge" },
    ],
  },
];

export default function SettingsPage() {
  const [destroyDialogOpen, setDestroyDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const queryClient = useQueryClient();

  const destroyMutation = useMutation({
    mutationFn: destroyAll,
    onSuccess: (data) => {
      setDestroyDialogOpen(false);
      setConfirmText("");
      setStatusMessage({
        type: "success",
        text: "Destruction initiated! Cleaning up resources in background...",
      });
      // Clear message and refresh data after delay
      setTimeout(() => {
        setStatusMessage(null);
        queryClient.invalidateQueries({ queryKey: ["workspaces"] });
        queryClient.invalidateQueries({ queryKey: ["catalog"] });
      }, 5000);
    },
    onError: (error) => {
      setStatusMessage({
        type: "error",
        text: `Error: ${error.message}`,
      });
      setTimeout(() => setStatusMessage(null), 5000);
    },
  });

  const syncMutation = useMutation({
    mutationFn: syncCatalog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
  });

  return (
    <div className="p-8">
      {/* Status Message Banner */}
      {statusMessage && (
        <div
          className={`mb-6 p-4 rounded-lg border animate-fade-in ${
            statusMessage.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-red-500/10 border-red-500/30 text-red-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-gray-500 to-slate-600 shadow-lg shadow-gray-500/25">
            <Settings className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure your platform preferences
            </p>
          </div>
        </div>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {settingsSections.map((section, sectionIndex) => {
          const Icon = section.icon;
          return (
            <Card
              key={section.title}
              className={cn(
                "border-border/50 animate-slide-up opacity-0",
                `stagger-${(sectionIndex % 5) + 1}`
              )}
              style={{ animationFillMode: "forwards" }}
            >
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br shadow-lg",
                      section.color
                    )}
                    style={{
                      boxShadow: `0 10px 25px -5px ${
                        section.color.includes("cyan")
                          ? "rgba(6, 182, 212, 0.25)"
                          : section.color.includes("amber")
                          ? "rgba(245, 158, 11, 0.25)"
                          : section.color.includes("purple")
                          ? "rgba(168, 85, 247, 0.25)"
                          : "rgba(16, 185, 129, 0.25)"
                      }`,
                    }}
                  >
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    {section.title}
                    <CardDescription className="font-normal">
                      {section.description}
                    </CardDescription>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {section.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50"
                  >
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    {item.type === "endpoint" && (
                      <code className="text-xs font-mono text-primary bg-primary/10 px-2 py-1 rounded">
                        {item.value}
                      </code>
                    )}
                    {item.type === "config" && (
                      <span className="text-sm font-medium">{item.value}</span>
                    )}
                    {item.type === "status" && (
                      <div className="flex items-center gap-1.5">
                        <div
                          className={cn(
                            "h-2 w-2 rounded-full",
                            item.ok ? "bg-emerald-400" : "bg-amber-400"
                          )}
                        />
                        <span
                          className={cn(
                            "text-sm font-medium",
                            item.ok ? "text-emerald-400" : "text-amber-400"
                          )}
                        >
                          {item.value}
                        </span>
                      </div>
                    )}
                    {item.type === "toggle" && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          item.ok
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                            : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                        )}
                      >
                        {item.value}
                      </Badge>
                    )}
                    {item.type === "badge" && (
                      <Badge variant="secondary" className="text-[10px]">
                        {item.value}
                      </Badge>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* About Section */}
      <Card
        className="mt-6 border-border/50 animate-slide-up opacity-0 stagger-5"
        style={{ animationFillMode: "forwards" }}
      >
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25">
              <Code className="h-5 w-5 text-white" />
            </div>
            <div>
              About
              <CardDescription className="font-normal">
                Platform information and resources
              </CardDescription>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Version</span>
                <Badge variant="outline" className="text-[10px]">
                  v1.0.0
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Self-Service Catalog Platform
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Stack</span>
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Next.js 14 + FastAPI + Terraform
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Documentation</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <Button variant="link" className="h-auto p-0 text-xs text-primary">
                View Docs
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card
        className="mt-6 border-red-500/30 bg-red-500/5 animate-slide-up opacity-0 stagger-5"
        style={{ animationFillMode: "forwards" }}
      >
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-rose-600 shadow-lg shadow-red-500/25">
              <AlertTriangle className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-red-400">Danger Zone</span>
              <CardDescription className="font-normal text-red-400/70">
                Destructive actions - use with caution
              </CardDescription>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <div>
              <p className="text-sm font-medium text-red-300">Destroy All & Reset</p>
              <p className="text-xs text-red-400/70 mt-1">
                Destroys all Kubernetes workspaces, clears catalog data, removes DNS entries and port-forwards.
                This action cannot be undone.
              </p>
            </div>
            <Dialog open={destroyDialogOpen} onOpenChange={setDestroyDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" className="gap-2 shrink-0">
                  <Trash2 className="h-4 w-4" />
                  Destroy All
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-red-400">
                    <AlertTriangle className="h-5 w-5" />
                    Confirm Destruction
                  </DialogTitle>
                  <DialogDescription>
                    This will permanently destroy all workspaces and reset the catalog.
                    Type <strong className="text-red-400">DESTROY</strong> to confirm.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Type DESTROY to confirm"
                    className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDestroyDialogOpen(false);
                      setConfirmText("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={confirmText !== "DESTROY" || destroyMutation.isPending}
                    onClick={() => destroyMutation.mutate()}
                  >
                    {destroyMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Destroying...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Destroy Everything
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
            <div>
              <p className="text-sm font-medium">Re-sync Catalog</p>
              <p className="text-xs text-muted-foreground mt-1">
                Scan the apps directory and refresh the catalog database.
              </p>
            </div>
            <Button
              variant="outline"
              className="gap-2 shrink-0"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync Catalog
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

