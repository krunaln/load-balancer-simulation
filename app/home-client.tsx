"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  algorithms,
  createInitialState,
  getAlgorithm,
  getWorkload,
  stepSimulation,
  workloads,
  type AlgorithmId,
  type LoadBalancerState,
  type ServerState,
  type SimulationState,
  type WorkloadId,
} from "@/lib/sim";

const BASE_TICK_MS = 1000;

const formatMs = (value: number) => `${Math.round(value)}ms`;

const MiniChart = ({
  values,
  stroke,
  maxValue,
}: {
  values: number[];
  stroke: string;
  maxValue?: number;
}) => {
  const width = 160;
  const height = 56;
  if (!values.length) {
    return (
      <div className="flex h-[56px] items-center justify-center rounded-lg border border-slate-200 bg-white text-[10px] text-slate-400">
        No data
      </div>
    );
  }

  const max = maxValue ?? Math.max(...values, 1);
  const points =
    values.length === 1
      ? `0,${height - (values[0] / max) * height} ${width},${
          height - (values[0] / max) * height
        }`
      : values
          .map((value, index) => {
            const x = (index / (values.length - 1)) * width;
            const y = height - (value / max) * height;
            return `${x},${y}`;
          })
          .join(" ");

  return (
    <svg
      width={width}
      height={height}
      className="rounded-lg border border-slate-200 bg-white"
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        points={points}
      />
    </svg>
  );
};

type NodeActionProps = {
  onAddBelow?: () => void;
  addLabel?: string;
};

type ClientNodeData = NodeActionProps & {
  name: string;
  currentRequests: number;
  totalRequests: number;
};

type LbNodeData = NodeActionProps & {
  name: string;
  id: string;
  isUp: boolean;
  isLeader: boolean;
  currentRequests: number;
  maxThroughputRps: number;
  onToggle: () => void;
  onRemove: () => void;
  onMakeLeader: () => void;
};

type ServerNodeData = NodeActionProps & {
  name: string;
  id: string;
  isUp: boolean;
  processingNow: number;
  requestCapacity: number;
  totalProcessed: number;
  totalFailed: number;
  onToggle: () => void;
  onRemove: () => void;
};

const AddBelowButton = ({ onAddBelow, addLabel }: NodeActionProps) => {
  if (!onAddBelow) return null;
  return (
    <div className="pointer-events-auto absolute -bottom-16 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1">
      <div className="h-7 w-[2px] bg-slate-300" />
      <button
        className="nodrag nopan flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-xl text-slate-700 shadow-sm hover:border-slate-400"
        onClick={(event) => {
          event.stopPropagation();
          onAddBelow();
        }}
        aria-label={addLabel ?? "Add node"}
        title={addLabel ?? "Add node"}
      >
        +
      </button>
    </div>
  );
};

const ClientNode = ({ data }: NodeProps<ClientNodeData>) => {
  return (
    <div className="relative min-w-[170px] rounded-2xl border border-violet-200 bg-white p-4 text-xs text-slate-700 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
      <p className="text-[10px] uppercase tracking-[0.18em] text-violet-500">
        Source
      </p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{data.name}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <p className="text-slate-400">Current no. of requests</p>
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
        className="!h-3 !w-3 !border-2 !border-violet-500 !bg-white"
      />
    </div>
  );
};

const LbNode = ({ data }: NodeProps<LbNodeData>) => {
  return (
    <div className="relative min-w-[240px] rounded-2xl border border-emerald-200 bg-white p-4 text-xs text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{data.name}</p>
          <p className="text-[10px] text-slate-400">{data.id}</p>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${
            data.isUp
              ? "bg-emerald-100 text-emerald-700"
              : "bg-rose-100 text-rose-700"
          }`}
        >
          {data.isUp ? "Up" : "Down"}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="nodrag nopan rounded-full border border-slate-200 px-3 py-1 text-[10px] text-slate-600 hover:border-emerald-300"
          onClick={(event) => {
            event.stopPropagation();
            data.onToggle();
          }}
        >
          Toggle
        </button>
        <button
          className={`nodrag nopan rounded-full px-3 py-1 text-[10px] ${
            data.isLeader
              ? "bg-amber-100 text-amber-700"
              : "border border-slate-200 text-slate-600 hover:border-amber-300"
          }`}
          onClick={(event) => {
            event.stopPropagation();
            data.onMakeLeader();
          }}
        >
          {data.isLeader ? "Leader" : "Make Leader"}
        </button>
        <button
          className="nodrag nopan rounded-full border border-slate-200 px-3 py-1 text-[10px] text-slate-600 hover:border-rose-300"
          onClick={(event) => {
            event.stopPropagation();
            data.onRemove();
          }}
        >
          Remove
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-[10px]">
        <div>
          <p className="text-slate-400">Current no. of request</p>
          <p className="text-sm font-semibold text-slate-900">
            {data.currentRequests}
          </p>
        </div>
        <div>
          <p className="text-slate-400">Max Throughput</p>
          <p className="text-sm font-semibold text-slate-900">
            {data.maxThroughputRps} req/s
          </p>
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
      <AddBelowButton onAddBelow={data.onAddBelow} addLabel={data.addLabel} />
    </div>
  );
};

const ServerNode = ({ data }: NodeProps<ServerNodeData>) => {
  return (
    <div className="relative min-w-[280px] rounded-2xl border border-sky-200 bg-white p-4 text-xs text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{data.name}</p>
          <p className="text-[10px] text-slate-400">{data.id}</p>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${
            data.isUp
              ? "bg-sky-100 text-sky-700"
              : "bg-rose-100 text-rose-700"
          }`}
        >
          {data.isUp ? "Up" : "Down"}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-[10px]">
        <div>
          <p className="text-slate-400">Request Processing Capacity</p>
          <p className="text-sm font-semibold text-slate-900">
            {data.requestCapacity}
          </p>
        </div>
        <div>
          <p className="text-slate-400">Processing now</p>
          <p className="text-sm font-semibold text-slate-900">
            {data.processingNow}
          </p>
        </div>
        <div>
          <p className="text-slate-400">Total requests processed</p>
          <p className="text-sm font-semibold text-slate-900">
            {data.totalProcessed}
          </p>
        </div>
        <div>
          <p className="text-slate-400">Total request failed to process</p>
          <p className="text-sm font-semibold text-slate-900">
            {data.totalFailed}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="nodrag nopan rounded-full border border-slate-200 px-3 py-1 text-[10px] text-slate-600 hover:border-sky-300"
          onClick={(event) => {
            event.stopPropagation();
            data.onToggle();
          }}
        >
          Toggle
        </button>
        <button
          className="nodrag nopan rounded-full border border-slate-200 px-3 py-1 text-[10px] text-slate-600 hover:border-rose-300"
          onClick={(event) => {
            event.stopPropagation();
            data.onRemove();
          }}
        >
          Remove
        </button>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-sky-500 !bg-white"
      />
      <AddBelowButton onAddBelow={data.onAddBelow} addLabel={data.addLabel} />
    </div>
  );
};

export default function HomeClient() {
  const [state, setState] = useState<SimulationState>(() =>
    createInitialState()
  );
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setState((prev) => stepSimulation(prev, BASE_TICK_MS * speed));
    }, BASE_TICK_MS);
    return () => clearInterval(interval);
  }, [running, speed]);

  const highlightedEdgeId = useMemo(() => {
    const lastDecision = [...state.log]
      .reverse()
      .find(
        (entry) =>
          entry.serverId &&
          (entry.status === "started" || entry.status === "queued")
      );
    if (!lastDecision?.serverId) return null;
    if (state.timeMs - lastDecision.timeMs > 2000) return null;
    const lbId = lastDecision.lbId ?? state.leaderLbId;
    if (!lbId) return null;
    return `edge-${lbId}-${lastDecision.serverId}`;
  }, [state.log, state.timeMs, state.leaderLbId]);

  const metrics = useMemo(() => {
    const latest = state.metrics[state.metrics.length - 1];
    return {
      avgLatency: latest?.avgLatencyMs ?? 0,
      waitingRequests: latest?.queueDepth ?? 0,
      processingNow: latest?.inflight ?? 0,
      failureRate: latest?.failureRate ?? 0,
    };
  }, [state.metrics]);

  const handleStep = () => {
    setState((prev) => stepSimulation(prev, BASE_TICK_MS));
  };

  const handleReset = () => {
    setState(createInitialState());
    setRunning(false);
  };

  const updateServer = (id: string, updates: Partial<ServerState>) => {
    setState((prev) => ({
      ...prev,
      servers: prev.servers.map((server) =>
        server.id === id ? { ...server, ...updates } : server
      ),
    }));
  };

  const updateLoadBalancer = (
    id: string,
    updates: Partial<LoadBalancerState>
  ) => {
    setState((prev) => ({
      ...prev,
      loadBalancers: prev.loadBalancers.map((lb) =>
        lb.id === id ? { ...lb, ...updates } : lb
      ),
    }));
  };

  const addServer = () => {
    setState((prev) => {
      const nextIndex =
        Math.max(
          0,
          ...prev.servers.map((server) =>
            Number(server.id.replace("srv-", "")) || 0
          )
        ) + 1;
      const newServer: ServerState = {
        id: `srv-${nextIndex}`,
        name: `Server ${nextIndex}`,
        isUp: true,
        maxConnections: 12,
        queueLimit: 18,
        baseLatencyMs: 170,
        jitterMs: 35,
        slowFactor: 1,
        dropRate: 0,
        totalProcessed: 0,
        totalFailed: 0,
        inflight: [],
        queue: [],
      };
      const loadBalancers = prev.loadBalancers.map((lb) => ({
        ...lb,
        healthSnapshot: { ...lb.healthSnapshot, [newServer.id]: newServer.isUp },
      }));
      return {
        ...prev,
        servers: [...prev.servers, newServer],
        loadBalancers,
      };
    });
  };

  const removeServer = (id: string) => {
    setState((prev) => {
      const servers = prev.servers.filter((server) => server.id !== id);
      const loadBalancers = prev.loadBalancers.map((lb) => {
        const nextSnapshot = { ...lb.healthSnapshot };
        delete nextSnapshot[id];
        return { ...lb, healthSnapshot: nextSnapshot };
      });
      return { ...prev, servers, loadBalancers };
    });
  };

  const addLoadBalancer = () => {
    setState((prev) => {
      const nextIndex =
        Math.max(
          0,
          ...prev.loadBalancers.map((lb) =>
            Number(lb.id.replace("lb-", "")) || 0
          )
        ) + 1;
      const newLb: LoadBalancerState = {
        id: `lb-${nextIndex}`,
        name: `LB ${String.fromCharCode(64 + nextIndex)}`,
        isUp: true,
        currentRequests: 0,
        maxThroughputRps: 30,
        decisionLatencyMs: 10,
        staleHealth: false,
        healthIntervalMs: 3000,
        lastHealthCheckMs: 0,
        healthSnapshot: Object.fromEntries(
          prev.servers.map((server) => [server.id, server.isUp])
        ),
      };
      return {
        ...prev,
        loadBalancers: [...prev.loadBalancers, newLb],
      };
    });
  };

  const removeLoadBalancer = (id: string) => {
    setState((prev) => {
      const loadBalancers = prev.loadBalancers.filter((lb) => lb.id !== id);
      const leaderLbId =
        prev.leaderLbId === id
          ? loadBalancers[0]?.id ?? null
          : prev.leaderLbId;
      return { ...prev, loadBalancers, leaderLbId };
    });
  };

  const latestAlgorithm = getAlgorithm(state.algorithmId);
  const latestWorkload = getWorkload(state.workloadId);

  const topologyNodes = useMemo((): Node[] => {
    const clientX = 80;
    const lbX = 430;
    const serverX = 900;
    const serverSpacing = 210;
    const lbSpacing = 180;
    const firstRowY = 140;

    const serverCenterY =
      state.servers.length > 0
        ? firstRowY + ((state.servers.length - 1) * serverSpacing) / 2
        : 260;

    const lbStartY = serverCenterY - ((state.loadBalancers.length - 1) * lbSpacing) / 2;

    const clientNode: Node = {
      id: "client-1",
      type: "client",
      data: {
        name: "Clients",
        currentRequests: metrics.processingNow + metrics.waitingRequests,
        totalRequests: Math.max(0, state.nextRequestId - 1),
      } satisfies ClientNodeData,
      position: { x: clientX, y: serverCenterY },
    };

    const lbNodes: Node[] = state.loadBalancers.map((lb, index) => ({
      id: lb.id,
      type: "lb",
      data: {
        id: lb.id,
        name: lb.name,
        isUp: lb.isUp,
        isLeader: lb.id === state.leaderLbId,
        currentRequests: lb.currentRequests,
        maxThroughputRps: lb.maxThroughputRps,
        onToggle: () => updateLoadBalancer(lb.id, { isUp: !lb.isUp }),
        onRemove: () => removeLoadBalancer(lb.id),
        onMakeLeader: () =>
          setState((prev) => ({ ...prev, leaderLbId: lb.id })),
        onAddBelow:
          index === state.loadBalancers.length - 1 ? addLoadBalancer : undefined,
        addLabel:
          index === state.loadBalancers.length - 1
            ? "Add load balancer"
            : undefined,
      } satisfies LbNodeData,
      position: { x: lbX, y: lbStartY + index * lbSpacing },
    }));

    const serverNodes: Node[] = state.servers.map((server, index) => ({
      id: server.id,
      type: "server",
      data: {
        id: server.id,
        name: server.name,
        isUp: server.isUp,
        processingNow: server.inflight.length,
        requestCapacity: server.maxConnections,
        totalProcessed: server.totalProcessed,
        totalFailed: server.totalFailed,
        onToggle: () => updateServer(server.id, { isUp: !server.isUp }),
        onRemove: () => removeServer(server.id),
        onAddBelow: index === state.servers.length - 1 ? addServer : undefined,
        addLabel: index === state.servers.length - 1 ? "Add server" : undefined,
      } satisfies ServerNodeData,
      position: { x: serverX, y: firstRowY + index * serverSpacing },
    }));

    return [clientNode, ...lbNodes, ...serverNodes];
  }, [
    state.loadBalancers,
    state.servers,
    state.leaderLbId,
    metrics.processingNow,
    metrics.waitingRequests,
    state.nextRequestId,
  ]);

  const topologyEdges = useMemo((): Edge[] => {
    const leader = state.loadBalancers.find((lb) => lb.id === state.leaderLbId);

    const clientToLbEdges = state.loadBalancers.map((lb) => ({
      id: `edge-client-${lb.id}`,
      source: "client-1",
      target: lb.id,
      type: "bezier",
      animated: lb.id === state.leaderLbId,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: lb.id === state.leaderLbId ? "#7c3aed" : "#94a3b8",
        width: 16,
        height: 16,
      },
      style: {
        stroke: lb.id === state.leaderLbId ? "#7c3aed" : "#94a3b8",
        strokeWidth: lb.id === state.leaderLbId ? 3 : 2,
      },
    } satisfies Edge));

    if (!leader) {
      return clientToLbEdges;
    }

    const lbToServerEdges = state.servers.map((server) => {
      const edgeId = `edge-${leader.id}-${server.id}`;
      const isHighlighted = highlightedEdgeId === edgeId;
      return {
        id: edgeId,
        source: leader.id,
        target: server.id,
        animated: isHighlighted,
        type: "bezier",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isHighlighted ? "#f59e0b" : "#334155",
          width: 16,
          height: 16,
        },
        style: {
          stroke: isHighlighted ? "#f59e0b" : "#334155",
          strokeWidth: isHighlighted ? 3 : 2,
        },
      } satisfies Edge;
    });

    return [...clientToLbEdges, ...lbToServerEdges];
  }, [
    state.loadBalancers,
    state.leaderLbId,
    state.servers,
    highlightedEdgeId,
  ]);

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
      <div className="relative h-screen w-screen overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#ffffff_0%,_#f6f8fb_55%,_#eef2f7_100%)]" />

        <div className="absolute inset-0">
          <ReactFlow
            nodes={topologyNodes}
            edges={topologyEdges}
            nodeTypes={{ client: ClientNode, lb: LbNode, server: ServerNode }}
            fitView
            fitViewOptions={{ padding: 0.24 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnScroll
            panOnScroll
          >
            <Background color="#e2e8f0" gap={28} />
          </ReactFlow>
        </div>

        <div className="pointer-events-none absolute right-3 top-3 w-[calc(100vw-1.5rem)] max-w-[340px] sm:right-6 sm:top-6 sm:w-[340px]">
          <div className="pointer-events-auto rounded-2xl border border-slate-200 bg-white/92 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Live Metrics
            </p>
            <div className="mt-3 grid gap-3 text-xs">
              <div>
                <p className="text-slate-500">Average latency</p>
                <p className="text-lg font-semibold text-slate-900">
                  {formatMs(metrics.avgLatency)}
                </p>
                <MiniChart
                  values={state.metrics.map((point) => point.avgLatencyMs)}
                  stroke="#0ea5e9"
                />
              </div>
              <div>
                <p className="text-slate-500">Waiting requests</p>
                <p className="text-lg font-semibold text-slate-900">
                  {metrics.waitingRequests}
                </p>
                <MiniChart
                  values={state.metrics.map((point) => point.queueDepth)}
                  stroke="#f59e0b"
                  maxValue={Math.max(10, metrics.waitingRequests + 5)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-slate-500">Processing now</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {metrics.processingNow}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Failure rate</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {metrics.failureRate.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-4 left-1/2 w-[min(1180px,96vw)] -translate-x-1/2 sm:bottom-6">
          <div className="pointer-events-auto rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.1)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Command Deck
                </p>
                <p className="text-sm text-slate-600">
                  {latestAlgorithm.name} · {latestWorkload.name}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:border-emerald-300"
                  onClick={() => setRunning((prev) => !prev)}
                >
                  {running ? "Pause" : "Play"}
                </button>
                <button
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:border-sky-300"
                  onClick={handleStep}
                >
                  Step
                </button>
                <button
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:border-rose-300"
                  onClick={handleReset}
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  Algorithm
                </p>
                <select
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                  value={state.algorithmId}
                  onChange={(event) =>
                    setState((prev) => ({
                      ...prev,
                      algorithmId: event.target.value as AlgorithmId,
                    }))
                  }
                >
                  {algorithms.map((algo) => (
                    <option key={algo.id} value={algo.id}>
                      {algo.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  Workload
                </p>
                <select
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                  value={state.workloadId}
                  onChange={(event) =>
                    setState((prev) => ({
                      ...prev,
                      workloadId: event.target.value as WorkloadId,
                    }))
                  }
                >
                  {workloads.map((workload) => (
                    <option key={workload.id} value={workload.id}>
                      {workload.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  Speed
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[0.25, 0.5, 1, 2, 4].map((value) => (
                    <button
                      key={value}
                      className={`rounded-full px-3 py-1 text-[10px] transition ${
                        speed === value
                          ? "bg-emerald-500 text-white"
                          : "border border-slate-200 text-slate-600 hover:border-emerald-300"
                      }`}
                      onClick={() => setSpeed(value)}
                    >
                      {value === 4 ? "Prod" : `${value}x`}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-slate-400">
                  1x = 1 second per tick
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  Terminology
                </p>
                <p className="mt-2 text-[10px] text-slate-500">
                  `Request Processing Capacity` = max requests a server can run concurrently.
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  `Processing now` = current active requests on that server.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
