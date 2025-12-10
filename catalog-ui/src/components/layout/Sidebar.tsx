"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Boxes,
  Settings,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  {
    name: "Catalog",
    href: "/",
    icon: LayoutGrid,
    description: "Browse app blueprints",
  },
  {
    name: "My Workspaces",
    href: "/workspaces",
    icon: Boxes,
    description: "Manage deployments",
  },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
    description: "Configure preferences",
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 dark:border-border/50 bg-white dark:bg-card/50 backdrop-blur-xl">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 dark:border-border/50 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/25">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-tight">Service Catalog</span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Platform Portal
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        <div className="mb-4">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Navigation
          </p>
        </div>
        {navigation.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-cyan-50 dark:bg-primary/10 text-cyan-700 dark:text-primary"
                  : "text-slate-600 dark:text-muted-foreground hover:bg-slate-100 dark:hover:bg-muted hover:text-slate-900 dark:hover:text-foreground"
              )}
            >
              <item.icon
                className={cn(
                  "h-5 w-5 transition-colors",
                  isActive ? "text-cyan-600 dark:text-primary" : "text-slate-400 dark:text-muted-foreground group-hover:text-slate-700 dark:group-hover:text-foreground"
                )}
              />
              <div className="flex flex-1 flex-col">
                <span>{item.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {item.description}
                </span>
              </div>
              <ChevronRight
                className={cn(
                  "h-4 w-4 opacity-0 transition-all group-hover:opacity-100",
                  isActive && "opacity-100 text-cyan-600 dark:text-primary"
                )}
              />
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-200 dark:border-border/50 p-4">
        <div className="rounded-lg bg-gradient-to-r from-cyan-100 dark:from-cyan-500/10 to-purple-100 dark:to-purple-500/10 p-4">
          <p className="text-xs font-medium text-foreground">Platform v1.0</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Built with Next.js + FastAPI
          </p>
        </div>
      </div>
    </aside>
  );
}

