"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  MarkerType,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Layout, Server, Cog, Database } from "lucide-react";
import { Component, ComponentType } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AppTopologyProps {
  components: Component[];
}

const componentIcons: Record<ComponentType, typeof Layout> = {
  frontend: Layout,
  backend: Server,
  worker: Cog,
  database: Database,
};

const componentColors: Record<ComponentType, { bg: string; border: string; text: string; iconBg: string }> = {
  frontend: {
    bg: "bg-white dark:bg-card",
    border: "border-sky-300 dark:border-cyan-500/50",
    text: "text-sky-600 dark:text-cyan-400",
    iconBg: "bg-sky-100 dark:bg-cyan-500/20",
  },
  backend: {
    bg: "bg-white dark:bg-card",
    border: "border-emerald-300 dark:border-emerald-500/50",
    text: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-100 dark:bg-emerald-500/20",
  },
  worker: {
    bg: "bg-white dark:bg-card",
    border: "border-amber-300 dark:border-amber-500/50",
    text: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-100 dark:bg-amber-500/20",
  },
  database: {
    bg: "bg-white dark:bg-card",
    border: "border-violet-300 dark:border-violet-500/50",
    text: "text-violet-600 dark:text-violet-400",
    iconBg: "bg-violet-100 dark:bg-violet-500/20",
  },
};

function CustomNode({ data }: { data: { component: Component } }) {
  const { component } = data;
  const Icon = componentIcons[component.type];
  const colors = componentColors[component.type];

  return (
    <div
      className={cn(
        "px-4 py-3 rounded-xl border-2 shadow-lg min-w-[160px] transition-all hover:shadow-xl hover:scale-105",
        colors.bg,
        colors.border
      )}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <div className={cn("p-2 rounded-lg", colors.iconBg)}>
          <Icon className={cn("h-4 w-4", colors.text)} />
        </div>
        <span className="font-semibold text-sm text-slate-800 dark:text-foreground">{component.name}</span>
      </div>
      <div className="space-y-1.5 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-slate-500 dark:text-muted-foreground">Type:</span>
          <span className={cn("font-semibold capitalize", colors.text)}>
            {component.type}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500 dark:text-muted-foreground">Port:</span>
          <span className="font-mono font-medium text-slate-700 dark:text-foreground">{component.port}</span>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = {
  custom: CustomNode,
};

export function AppTopology({ components }: AppTopologyProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    // Create a map for quick lookup
    const componentMap = new Map(components.map((c) => [c.name, c]));

    // Group components by type for layered horizontal layout
    const typeOrder: ComponentType[] = ["frontend", "backend", "worker", "database"];
    const grouped = typeOrder.map((type) =>
      components.filter((c) => c.type === type)
    );

    const nodes: Node[] = [];
    const xSpacing = 280; // Horizontal spacing between layers
    const ySpacing = 140; // Vertical spacing within a layer

    // Calculate total height needed
    const maxGroupSize = Math.max(...grouped.map((g) => g.length));
    const totalHeight = (maxGroupSize - 1) * ySpacing;

    grouped.forEach((group, layerIndex) => {
      if (group.length === 0) return;

      const layerX = layerIndex * xSpacing + 80;
      const groupHeight = (group.length - 1) * ySpacing;
      const startY = (totalHeight - groupHeight) / 2 + 80;

      group.forEach((component, i) => {
        nodes.push({
          id: component.name,
          type: "custom",
          position: { x: layerX, y: startY + i * ySpacing },
          data: { component },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        });
      });
    });

    // Create edges based on dependencies
    const edges: Edge[] = [];
    components.forEach((component) => {
      if (component.dependencies) {
        component.dependencies.forEach((depName) => {
          if (componentMap.has(depName)) {
            edges.push({
              id: `${component.name}-${depName}`,
              source: component.name,
              target: depName,
              type: "smoothstep",
              animated: true,
              style: { 
                stroke: "hsl(var(--primary))", 
                strokeWidth: 2,
                opacity: 0.6,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: "hsl(var(--primary))",
                width: 20,
                height: 20,
              },
            });
          }
        });
      }
    });

    // If no explicit dependencies, create implied flow edges (frontend → backend → worker)
    if (edges.length === 0 && components.length > 1) {
      const frontends = components.filter((c) => c.type === "frontend");
      const backends = components.filter((c) => c.type === "backend");
      const workers = components.filter((c) => c.type === "worker");

      // Connect frontends to backends
      frontends.forEach((fe) => {
        backends.forEach((be) => {
          edges.push({
            id: `${fe.name}-${be.name}`,
            source: fe.name,
            target: be.name,
            type: "smoothstep",
            animated: true,
            style: { 
              stroke: "#94a3b8",
              strokeWidth: 2,
              strokeDasharray: "5,5",
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#94a3b8",
              width: 16,
              height: 16,
            },
          });
        });
      });

      // Connect backends to workers
      backends.forEach((be) => {
        workers.forEach((wk) => {
          edges.push({
            id: `${be.name}-${wk.name}`,
            source: be.name,
            target: wk.name,
            type: "smoothstep",
            animated: true,
            style: { 
              stroke: "#94a3b8",
              strokeWidth: 2,
              strokeDasharray: "5,5",
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#94a3b8",
              width: 16,
              height: 16,
            },
          });
        });
      });
    }

    return { nodes, edges };
  }, [components]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div className="h-full w-full rounded-xl border border-slate-200 dark:border-border/50 bg-slate-50/50 dark:bg-card/30 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.4, minZoom: 0.5, maxZoom: 1.2 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.5}
          color="hsl(var(--muted-foreground) / 0.2)"
        />
        <Controls
          className="!bg-white dark:!bg-card !border-slate-200 dark:!border-border !rounded-lg !shadow-md"
          showInteractive={false}
        />
      </ReactFlow>
    </div>
  );
}
