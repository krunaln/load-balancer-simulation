"use client";

import { useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Handle,
  MarkerType,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import { scenarios, type ScenarioDefinition } from "@/lib/scenario-learning";

const NODE_SIZES = {
  client: { width: 210, height: 130 },
  lb: { width: 270, height: 190 },
  server: { width: 320, height: 210 },
};

type ClientNodeData = {
  name: string;
  currentRequests: number;
  totalRequests: number;
};

type LbNodeData = {
  name: string;
  isLeader: boolean;
  queueDepth: number;
  drops: number;
};

type ServerNodeData = {
  name: string;
  status: "UP" | "SLOW" | "DOWN";
  active: number;
  processed: number;
  failed: number;
};

const Pill = ({ label }: { label: string }) => (
  <span className="rounded-full border border-slate-200 bg-white/80 px-2 py-1 text-[9px] uppercase tracking-[0.2em] text-slate-500">
    {label}
  </span>
);

const ClientNode = ({ data }: NodeProps<ClientNodeData>) => {
  return (
    <div className="pointer-events-auto relative min-w-[210px] rounded-[28px] border border-indigo-200/60 bg-white/90 p-5 text-xs text-slate-700 shadow-[0_20px_50px_rgba(15,23,42,0.12)] backdrop-blur">
      <div className="flex items-center justify-between">
        <Pill label="Clients" />
        <span className="rounded-full bg-indigo-100 px-2 py-1 text-[10px] text-indigo-700">
          Entry
        </span>
      </div>
      <p className="mt-3 text-lg font-semibold text-slate-900">{data.name}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-[10px]">
        <div>
          <p className="text-slate-400">Current requests</p>
          <p className="text-sm font-semibold text-slate-900">
            {data.currentRequests}
          </p>
        </div>
        <div>
          <p className="text-slate-400">Total requests</p>
          <p className="text-sm font-semibold text-slate-900">
            {data.totalRequests}
          </p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-indigo-500 !bg-white"
      />
    </div>
  );
};

const LbNode = ({ data }: NodeProps<LbNodeData>) => {
  return (
    <div className="pointer-events-auto relative min-w-[270px] rounded-[28px] border border-emerald-200/70 bg-white/90 p-5 text-xs text-slate-700 shadow-[0_20px_50px_rgba(15,23,42,0.12)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Pill label="Load Balancer" />
          <p className="mt-2 text-lg font-semibold text-slate-900">
            {data.name}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
            data.isLeader
              ? "bg-amber-100 text-amber-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {data.isLeader ? "Leader" : "Follower"}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-[10px]">
        <div>
          <p className="text-slate-400">LB queue</p>
          <p className="text-sm font-semibold text-slate-900">
            {data.queueDepth}
          </p>
        </div>
        <div>
          <p className="text-slate-400">Drops (503)</p>
          <p className="text-sm font-semibold text-slate-900">{data.drops}</p>
        </div>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-emerald-500 !bg-white"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-emerald-500 !bg-white"
      />
    </div>
  );
};

const ServerNode = ({ data }: NodeProps<ServerNodeData>) => {
  const statusColor =
    data.status === "DOWN"
      ? "bg-rose-100 text-rose-700"
      : data.status === "SLOW"
      ? "bg-amber-100 text-amber-700"
      : "bg-sky-100 text-sky-700";
  return (
    <div className="pointer-events-auto relative min-w-[320px] rounded-[28px] border border-sky-200/70 bg-white/90 p-5 text-xs text-slate-700 shadow-[0_20px_50px_rgba(15,23,42,0.12)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Pill label="Server" />
          <p className="mt-2 text-lg font-semibold text-slate-900">
            {data.name}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${statusColor}`}
        >
          {data.status}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-[10px]">
        <div>
          <p className="text-slate-400">Active requests</p>
          <p className="text-sm font-semibold text-slate-900">{data.active}</p>
        </div>
        <div>
          <p className="text-slate-400">Total processed</p>
          <p className="text-sm font-semibold text-slate-900">
            {data.processed}
          </p>
        </div>
        <div>
          <p className="text-slate-400">Total failed</p>
          <p className="text-sm font-semibold text-slate-900">{data.failed}</p>
        </div>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-sky-500 !bg-white"
      />
    </div>
  );
};

const mergeScenarioStep = (scenario: ScenarioDefinition, stepIndex: number) => {
  const step = scenario.steps[Math.max(0, Math.min(stepIndex, scenario.steps.length - 1))];

  const clients = {
    ...scenario.base.clients,
    ...step.stats?.clients,
  };

  const lbs = scenario.base.loadBalancers.map((lb) => ({
    ...lb,
    ...(step.stats?.lbs?.[lb.id] ?? {}),
  }));

  const servers = scenario.base.servers.map((server) => ({
    ...server,
    ...(step.stats?.servers?.[server.id] ?? {}),
  }));

  return { clients, lbs, servers, step };
};

const getScenarioGroups = (list: ScenarioDefinition[]) =>
  Array.from(new Set(list.map((item) => item.algorithm)));

export default function HomeClient() {
  const [selectedScenarioId, setSelectedScenarioId] = useState(
    scenarios[0]?.id ?? ""
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [introDismissed, setIntroDismissed] = useState(false);

  const scenario = useMemo(
    () => scenarios.find((item) => item.id === selectedScenarioId) ?? scenarios[0],
    [selectedScenarioId]
  );

  const { clients, lbs, servers, step } = useMemo(() => {
    return mergeScenarioStep(scenario, stepIndex);
  }, [scenario, stepIndex]);

  const lbX = 420;
  const serverX = 920;
  const clientX = 70;
  const serverSpacing = 230;
  const lbSpacing = 200;
  const firstRowY = 160;

  const serverCenterY =
    servers.length > 0
      ? firstRowY + ((servers.length - 1) * serverSpacing) / 2
      : 260;

  const lbStartY =
    serverCenterY - ((lbs.length - 1) * lbSpacing) / 2;

  const nodes = useMemo((): Node[] => {
    const clientNode: Node = {
      id: clients.id,
      type: "client",
      data: {
        name: clients.name,
        currentRequests: clients.currentRequests,
        totalRequests: clients.totalRequests,
      } satisfies ClientNodeData,
      position: { x: clientX, y: serverCenterY },
    };

    const lbNodes: Node[] = lbs.map((lb, index) => ({
      id: lb.id,
      type: "lb",
      data: {
        name: lb.name,
        isLeader: Boolean(lb.isLeader),
        queueDepth: lb.queueDepth,
        drops: lb.drops,
      } satisfies LbNodeData,
      position: { x: lbX, y: lbStartY + index * lbSpacing },
    }));

    const serverNodes: Node[] = servers.map((server, index) => ({
      id: server.id,
      type: "server",
      data: {
        name: server.name,
        status: server.status,
        active: server.active,
        processed: server.processed,
        failed: server.failed,
      } satisfies ServerNodeData,
      position: { x: serverX, y: firstRowY + index * serverSpacing },
    }));

    const highlightedNodes = step?.highlightNodeIds ?? [];
    return [clientNode, ...lbNodes, ...serverNodes].map((node) => {
      if (!highlightedNodes.includes(node.id)) return node;
      return {
        ...node,
        style: {
          ...(node.style ?? {}),
          boxShadow: "0 0 0 4px rgba(245,158,11,0.2)",
        },
      };
    });
  }, [clients, lbs, servers, lbStartY, serverCenterY, step]);

  const edges = useMemo((): Edge[] => {
    const leader = lbs.find((lb) => lb.isLeader) ?? lbs[0];

    const edgesList: Edge[] = [];
    if (leader) {
      edgesList.push({
        id: `edge-client-${leader.id}`,
        source: clients.id,
        target: leader.id,
        type: "bezier",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#7c3aed",
          width: 16,
          height: 16,
        },
        style: {
          stroke: "#7c3aed",
          strokeWidth: 2,
        },
      });

      servers.forEach((server) => {
        edgesList.push({
          id: `edge-${leader.id}-${server.id}`,
          source: leader.id,
          target: server.id,
          type: "bezier",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#334155",
            width: 16,
            height: 16,
          },
          style: {
            stroke: "#334155",
            strokeWidth: 2,
          },
        });
      });
    }

    const highlightedEdges = step?.highlightEdgeIds ?? [];
    return edgesList.map((edge) => {
      const isHighlighted = highlightedEdges.includes(edge.id);
      return {
        ...edge,
        animated: Boolean(isHighlighted),
        style: {
          ...(edge.style ?? {}),
          stroke: isHighlighted ? "#f59e0b" : edge.style?.stroke,
          strokeWidth: isHighlighted ? 3 : edge.style?.strokeWidth,
        },
      } satisfies Edge;
    });
  }, [clients.id, lbs, servers, step]);

  const nodePositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    nodes.forEach((node) => {
      positions[node.id] = node.position;
    });
    return positions;
  }, [nodes]);

  const calloutPosition = useMemo(() => {
    if (!step) return null;
    if (step.highlightEdgeIds && step.highlightEdgeIds.length > 0) {
      const edgeId = step.highlightEdgeIds[0];
      const [, sourceId, targetId] = edgeId.split("edge-").pop()?.split("-") ?? [];
      const source = nodePositions[sourceId ? `${sourceId}` : ""];
      const target = nodePositions[targetId ? `${targetId}` : ""];
      if (source && target) {
        return {
          x: (source.x + target.x) / 2 + 160,
          y: (source.y + target.y) / 2 + 40,
        };
      }
    }

    const targetNodeId = step.highlightNodeIds?.[0];
    if (!targetNodeId) return null;

    const pos = nodePositions[targetNodeId];
    if (!pos) return null;

    let size = NODE_SIZES.server;
    if (targetNodeId.startsWith("client")) size = NODE_SIZES.client;
    if (targetNodeId.startsWith("lb")) size = NODE_SIZES.lb;

    return {
      x: pos.x + size.width / 2,
      y: pos.y - 30,
    };
  }, [step, nodePositions]);

  const applyScenario = (nextScenario: ScenarioDefinition) => {
    setSelectedScenarioId(nextScenario.id);
    setStepIndex(0);
    setIntroDismissed(false);
  };

  const handlePrev = () => {
    setStepIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setStepIndex((prev) =>
      Math.min(scenario.steps.length - 1, prev + 1)
    );
  };

  return (
    <div className="min-h-screen bg-[#f3f1ec] text-slate-900">
      <div className="flex h-screen w-screen">
        <aside className="w-[300px] border-r border-slate-200 bg-white/90 p-4 backdrop-blur">
          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
            Scenarios
          </p>
          <div className="mt-4 space-y-4">
            {getScenarioGroups(scenarios).map((algo) => (
              <div key={algo}>
                <p className="text-[11px] font-semibold text-slate-700">
                  {algo}
                </p>
                <div className="mt-2 space-y-2">
                  {scenarios
                    .filter((item) => item.algorithm === algo)
                    .map((item) => (
                      <button
                        key={item.id}
                        className={`w-full rounded-2xl border px-3 py-2 text-left text-[11px] transition ${
                          item.id === scenario.id
                            ? "border-amber-300 bg-amber-50 text-amber-800"
                            : "border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                        onClick={() => applyScenario(item)}
                      >
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-[10px] text-slate-500">
                          {item.summary}
                        </p>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className="relative flex-1">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#fffdf8_0%,_#f3f1ec_55%,_#ece8e1_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(244,226,198,0.25),rgba(231,244,241,0.2),rgba(243,235,255,0.18))]" />

          <div className="absolute inset-0">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={{ client: ClientNode, lb: LbNode, server: ServerNode }}
              fitView
              fitViewOptions={{ padding: 0.24 }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              zoomOnScroll
              panOnScroll
            >
              <Background color="#d8d5cf" gap={30} />
            </ReactFlow>
          </div>

          <div className="pointer-events-none absolute left-5 top-5 max-w-[360px]">
            <div className="pointer-events-auto rounded-[28px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.12)] backdrop-blur">
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                Scenario Detail
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {scenario.name}
              </p>
              <p className="mt-1 text-[11px] text-slate-600">
                {scenario.summary}
              </p>
              <div className="mt-3">
                <p className="text-[10px] text-slate-400">Setup</p>
                <ul className="mt-1 list-disc pl-4 text-[10px] text-slate-500">
                  {scenario.setup.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="mt-3">
                <p className="text-[10px] text-slate-400">What this teaches</p>
                <ul className="mt-1 list-disc pl-4 text-[10px] text-slate-500">
                  {scenario.teaches.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {step && calloutPosition ? (
            <div
              className="pointer-events-none absolute"
              style={{
                left: calloutPosition.x,
                top: calloutPosition.y,
                transform: "translate(-50%, -100%)",
              }}
            >
              <div className="pointer-events-auto w-[280px] rounded-[24px] border border-slate-200 bg-white/95 px-4 py-3 text-[10px] text-slate-600 shadow-[0_16px_40px_rgba(15,23,42,0.14)] backdrop-blur">
                {step.title ? (
                  <p className="text-[10px] font-semibold text-slate-900">
                    {step.title}
                  </p>
                ) : null}
                <p className="mt-1 text-[10px] text-slate-600">{step.text}</p>
                <div className="mt-3 flex items-center justify-between">
                  <button
                    className="rounded-full border border-slate-200 px-2 py-1 text-[10px] text-slate-600 hover:border-slate-300"
                    onClick={handlePrev}
                  >
                    Prev
                  </button>
                  <span className="text-[10px] text-slate-400">
                    Step {Math.min(stepIndex + 1, scenario.steps.length)} of {scenario.steps.length}
                  </span>
                  <button
                    className="rounded-full border border-slate-200 px-2 py-1 text-[10px] text-slate-600 hover:border-slate-300"
                    onClick={handleNext}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {!introDismissed ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm">
              <div className="w-[520px] rounded-[30px] border border-slate-200/80 bg-white/95 p-6 text-slate-700 shadow-[0_30px_60px_rgba(15,23,42,0.2)]">
                <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                  Scenario Briefing
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {scenario.name}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {scenario.summary}
                </p>
                <div className="mt-4">
                  <p className="text-[11px] text-slate-500">Setup</p>
                  <ul className="mt-2 list-disc pl-5 text-[12px] text-slate-600">
                    {scenario.setup.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="mt-4">
                  <p className="text-[11px] text-slate-500">What this teaches</p>
                  <ul className="mt-2 list-disc pl-5 text-[12px] text-slate-600">
                    {scenario.teaches.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                    onClick={() => setIntroDismissed(true)}
                  >
                    Start Scenario
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
