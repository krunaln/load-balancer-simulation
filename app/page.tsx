"use client";

import { useEffect, useMemo, useState } from "react";
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

const BASE_TICK_MS = 250;

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
  const width = 220;
  const height = 70;
  if (!values.length) {
    return (
      <div className="flex h-[70px] items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xs text-white/50">
        No data yet
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
      className="rounded-xl border border-white/10 bg-white/5"
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

export default function Home() {
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

  const metrics = useMemo(() => {
    const latest = state.metrics[state.metrics.length - 1];
    return {
      avgLatency: latest?.avgLatencyMs ?? 0,
      queueDepth: latest?.queueDepth ?? 0,
      inflight: latest?.inflight ?? 0,
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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0f172a,_#020617_50%,_#020617)] text-white">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-60">
          <div className="absolute -top-24 left-8 h-80 w-80 rounded-full bg-teal-400/20 blur-[120px]" />
          <div className="absolute right-0 top-20 h-96 w-96 rounded-full bg-amber-400/20 blur-[140px]" />
          <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-cyan-500/20 blur-[120px]" />
        </div>
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12">
          <header className="flex flex-col gap-4">
            <p className="text-xs uppercase tracking-[0.3em] text-teal-200/80">
              Load Balancer Simulator
            </p>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-white md:text-5xl">
              Observe routing decisions, algorithm behavior, and failure modes in
              real time.
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-white/70">
              Choose an algorithm, set traffic patterns, inject failures, and
              watch how the system reacts. This v1 build focuses on clarity and
              extensibility so we can keep adding new strategies and scenarios.
            </p>
          </header>

          <section className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_0_40px_rgba(15,23,42,0.45)]">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                    Simulation Controls
                  </p>
                  <h2 className="text-2xl font-semibold">Command Deck</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-teal-300/60 hover:text-white"
                    onClick={() => setRunning((prev) => !prev)}
                  >
                    {running ? "Pause" : "Play"}
                  </button>
                  <button
                    className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-teal-300/60 hover:text-white"
                    onClick={handleStep}
                  >
                    Step
                  </button>
                  <button
                    className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-amber-300/60 hover:text-white"
                    onClick={handleReset}
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                    Algorithm
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    {latestAlgorithm.name}
                  </p>
                  <p className="text-sm text-white/60">
                    {latestAlgorithm.description}
                  </p>
                  <select
                    className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm"
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

                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                    Workload
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    {latestWorkload.name}
                  </p>
                  <p className="text-sm text-white/60">
                    {latestWorkload.description}
                  </p>
                  <select
                    className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm"
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
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                    Speed
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[1, 2, 4].map((value) => (
                      <button
                        key={value}
                        className={`rounded-full px-3 py-1 text-sm transition ${
                          speed === value
                            ? "bg-teal-400 text-slate-950"
                            : "border border-white/20 text-white/70 hover:border-teal-300/60"
                        }`}
                        onClick={() => setSpeed(value)}
                      >
                        {value}x
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                    Leader LB
                  </p>
                  <select
                    className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm"
                    value={state.leaderLbId ?? ""}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        leaderLbId: event.target.value,
                      }))
                    }
                  >
                    {state.loadBalancers.map((lb) => (
                      <option key={lb.id} value={lb.id}>
                        {lb.name} {lb.isUp ? "" : "(down)"}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-white/50">
                    Manual leader selection (v1).
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                    System Clock
                  </p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    {formatMs(state.timeMs)}
                  </p>
                  <p className="text-sm text-white/50">Simulated time</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-6">
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                Live Metrics
              </p>
              <div className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                      Avg Latency
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {formatMs(metrics.avgLatency)}
                    </p>
                    <MiniChart
                      values={state.metrics.map((point) => point.avgLatencyMs)}
                      stroke="#22d3ee"
                    />
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                      Queue Depth
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {metrics.queueDepth}
                    </p>
                    <MiniChart
                      values={state.metrics.map((point) => point.queueDepth)}
                      stroke="#fbbf24"
                      maxValue={Math.max(10, metrics.queueDepth + 5)}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                      Inflight
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {metrics.inflight}
                    </p>
                    <p className="text-sm text-white/50">
                      Active requests in servers.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                      Failure Rate
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {metrics.failureRate.toFixed(1)}%
                    </p>
                    <p className="text-sm text-white/50">
                      Failed vs processed this tick.
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                    Totals
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-white/50">Started</p>
                      <p className="text-lg font-semibold">
                        {state.totals.started}
                      </p>
                    </div>
                    <div>
                      <p className="text-white/50">Completed</p>
                      <p className="text-lg font-semibold">
                        {state.totals.completed}
                      </p>
                    </div>
                    <div>
                      <p className="text-white/50">Failed</p>
                      <p className="text-lg font-semibold">
                        {state.totals.failed}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                    Server Pool
                  </p>
                  <h3 className="text-2xl font-semibold">Nodes</h3>
                </div>
                <button
                  className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-teal-300/60 hover:text-white"
                  onClick={addServer}
                >
                  Add Server
                </button>
              </div>
              <div className="grid gap-4">
                {state.servers.map((server) => (
                  <div
                    key={server.id}
                    className="rounded-2xl border border-white/10 bg-slate-900/60 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold">{server.name}</p>
                        <p className="text-xs text-white/50">{server.id}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            server.isUp
                              ? "bg-emerald-400/20 text-emerald-200"
                              : "bg-rose-500/20 text-rose-200"
                          }`}
                          onClick={() =>
                            updateServer(server.id, { isUp: !server.isUp })
                          }
                        >
                          {server.isUp ? "Up" : "Down"}
                        </button>
                        <button
                          className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/60 hover:border-rose-300/60"
                          onClick={() => removeServer(server.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                          Live
                        </p>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <p className="text-white/40">Inflight</p>
                            <p className="text-lg font-semibold">
                              {server.inflight.length}
                            </p>
                          </div>
                          <div>
                            <p className="text-white/40">Queue</p>
                            <p className="text-lg font-semibold">
                              {server.queue.length}
                            </p>
                          </div>
                          <div>
                            <p className="text-white/40">Max</p>
                            <p className="text-lg font-semibold">
                              {server.maxConnections}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs text-white/50">
                        <p className="uppercase tracking-[0.2em] text-white/40">
                          Faults
                        </p>
                        <div className="mt-3 space-y-3">
                          <label className="flex items-center justify-between gap-3">
                            <span>Slow factor</span>
                            <input
                              type="range"
                              min={1}
                              max={3}
                              step={0.1}
                              value={server.slowFactor}
                              onChange={(event) =>
                                updateServer(server.id, {
                                  slowFactor: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                          <label className="flex items-center justify-between gap-3">
                            <span>Drop rate</span>
                            <input
                              type="range"
                              min={0}
                              max={0.5}
                              step={0.05}
                              value={server.dropRate}
                              onChange={(event) =>
                                updateServer(server.id, {
                                  dropRate: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                          <label className="flex items-center justify-between gap-3">
                            <span>Capacity</span>
                            <input
                              type="range"
                              min={4}
                              max={24}
                              step={1}
                              value={server.maxConnections}
                              onChange={(event) =>
                                updateServer(server.id, {
                                  maxConnections: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                    Load Balancers
                  </p>
                  <h3 className="text-2xl font-semibold">Control Plane</h3>
                </div>
                <button
                  className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-teal-300/60 hover:text-white"
                  onClick={addLoadBalancer}
                >
                  Add LB
                </button>
              </div>
              <div className="grid gap-4">
                {state.loadBalancers.map((lb) => (
                  <div
                    key={lb.id}
                    className={`rounded-2xl border border-white/10 p-4 ${
                      lb.id === state.leaderLbId
                        ? "bg-teal-500/10"
                        : "bg-slate-900/60"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold">{lb.name}</p>
                        <p className="text-xs text-white/50">{lb.id}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            lb.isUp
                              ? "bg-emerald-400/20 text-emerald-200"
                              : "bg-rose-500/20 text-rose-200"
                          }`}
                          onClick={() =>
                            updateLoadBalancer(lb.id, { isUp: !lb.isUp })
                          }
                        >
                          {lb.isUp ? "Up" : "Down"}
                        </button>
                        <button
                          className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/60 hover:border-rose-300/60"
                          onClick={() => removeLoadBalancer(lb.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3 text-xs text-white/50">
                      <label className="flex items-center justify-between gap-3">
                        <span>Decision latency</span>
                        <input
                          type="range"
                          min={0}
                          max={40}
                          step={2}
                          value={lb.decisionLatencyMs}
                          onChange={(event) =>
                            updateLoadBalancer(lb.id, {
                              decisionLatencyMs: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3">
                        <span>Stale health</span>
                        <input
                          type="checkbox"
                          checked={lb.staleHealth}
                          onChange={() =>
                            updateLoadBalancer(lb.id, {
                              staleHealth: !lb.staleHealth,
                            })
                          }
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3">
                        <span>Health interval</span>
                        <input
                          type="range"
                          min={500}
                          max={6000}
                          step={500}
                          value={lb.healthIntervalMs}
                          onChange={(event) =>
                            updateLoadBalancer(lb.id, {
                              healthIntervalMs: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                  Decision Log
                </p>
                <h3 className="text-2xl font-semibold">Why This Server?</h3>
              </div>
              <p className="text-xs text-white/50">
                Showing {state.log.length} recent events.
              </p>
            </div>
            <div className="max-h-[320px] overflow-auto rounded-2xl border border-white/10 bg-slate-950/70">
              <table className="w-full text-left text-xs text-white/70">
                <thead className="sticky top-0 bg-slate-950/90 text-xs uppercase tracking-[0.2em] text-white/40">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Event</th>
                  </tr>
                </thead>
                <tbody>
                  {state.log
                    .slice()
                    .reverse()
                    .map((entry) => (
                      <tr
                        key={`${entry.id}-${entry.timeMs}-${entry.status}`}
                        className="border-t border-white/5"
                      >
                        <td className="px-4 py-2 text-white/50">
                          {formatMs(entry.timeMs)}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${
                              entry.status === "failed"
                                ? "bg-rose-500/20 text-rose-200"
                                : entry.status === "completed"
                                ? "bg-emerald-400/20 text-emerald-200"
                                : entry.status === "queued"
                                ? "bg-amber-400/20 text-amber-200"
                                : "bg-sky-400/20 text-sky-200"
                            }`}
                          >
                            {entry.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-white/70">
                          {entry.message}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
