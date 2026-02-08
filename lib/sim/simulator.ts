import { getAlgorithm } from "./algorithms";
import { getWorkload } from "./workloads";
import type {
  LoadBalancerState,
  MetricsPoint,
  Request,
  ServerState,
  SimulationState,
} from "./types";

const LOG_LIMIT = 220;
const METRICS_LIMIT = 120;
const LATENCY_WINDOW = 200;

const cloneServer = (server: ServerState): ServerState => ({
  ...server,
  inflight: [...server.inflight],
  queue: [...server.queue],
});

const cloneLb = (lb: LoadBalancerState): LoadBalancerState => ({
  ...lb,
  healthSnapshot: { ...lb.healthSnapshot },
});

const pushLog = (state: SimulationState, entry: SimulationState["log"][0]) => {
  state.log.push(entry);
  if (state.log.length > LOG_LIMIT) {
    state.log.splice(0, state.log.length - LOG_LIMIT);
  }
};

const addLatencySample = (state: SimulationState, latencyMs: number) => {
  state.recentLatencies.push(latencyMs);
  if (state.recentLatencies.length > LATENCY_WINDOW) {
    state.recentLatencies.splice(0, state.recentLatencies.length - LATENCY_WINDOW);
  }
};

const computeAvgLatency = (latencies: number[]) => {
  if (!latencies.length) return 0;
  const total = latencies.reduce((sum, value) => sum + value, 0);
  return total / latencies.length;
};

const updateHealthSnapshot = (
  lb: LoadBalancerState,
  servers: ServerState[],
  timeMs: number
) => {
  if (timeMs - lb.lastHealthCheckMs < lb.healthIntervalMs) return;
  lb.lastHealthCheckMs = timeMs;
  lb.healthSnapshot = Object.fromEntries(
    servers.map((server) => [server.id, server.isUp])
  );
};

const sampleJitter = (server: ServerState) => {
  if (server.jitterMs <= 0) return 0;
  return (Math.random() * 2 - 1) * server.jitterMs;
};

const canAcceptOnServer = (server: ServerState) =>
  server.isUp && server.inflight.length < server.maxConnections;

export const stepSimulation = (
  prev: SimulationState,
  dtMs: number
): SimulationState => {
  const state: SimulationState = {
    ...prev,
    timeMs: prev.timeMs + dtMs,
    servers: prev.servers.map(cloneServer),
    loadBalancers: prev.loadBalancers.map(cloneLb),
    log: [...prev.log],
    metrics: [...prev.metrics],
    recentLatencies: [...prev.recentLatencies],
    totals: { ...prev.totals },
  };

  let completedThisTick = 0;
  let failedThisTick = 0;

  for (const server of state.servers) {
    if (server.isUp) {
      while (server.queue.length && canAcceptOnServer(server)) {
        const next = server.queue.shift();
        if (!next) break;
        next.startTimeMs = state.timeMs;
        next.remainingTimeMs = next.serviceTimeMs;
        next.status = "started";
        server.inflight.push(next);
        pushLog(state, {
          id: next.id,
          timeMs: state.timeMs,
          status: "started",
          message: `Request ${next.id} started on ${server.id} after queue`,
        });
      }
    }

    const stillInflight: Request[] = [];
    for (const req of server.inflight) {
      req.remainingTimeMs -= dtMs;
      if (req.remainingTimeMs <= 0) {
        req.status = "completed";
        req.latencyMs = state.timeMs - req.arrivalTimeMs;
        completedThisTick += 1;
        state.totals.completed += 1;
        addLatencySample(state, req.latencyMs);
        pushLog(state, {
          id: req.id,
          timeMs: state.timeMs,
          status: "completed",
          message: `Request ${req.id} completed on ${server.id} in ${Math.round(
            req.latencyMs
          )}ms`,
        });
      } else {
        stillInflight.push(req);
      }
    }
    server.inflight = stillInflight;
  }

  const workload = getWorkload(state.workloadId);
  const arrivalRate = workload.rateRps(state.timeMs);
  const expected = (arrivalRate * dtMs) / 1000;
  const arrivals = Math.floor(state.pendingRemainder + expected);
  state.pendingRemainder = state.pendingRemainder + expected - arrivals;

  const leader = state.loadBalancers.find((lb) => lb.id === state.leaderLbId) ?? null;

  for (let i = 0; i < arrivals; i += 1) {
    const requestId = state.nextRequestId++;
    const req: Request = {
      id: requestId,
      arrivalTimeMs: state.timeMs,
      serviceTimeMs: 0,
      remainingTimeMs: 0,
      status: "failed",
    };

    if (!leader || !leader.isUp) {
      req.failureReason = "load balancer unavailable";
      failedThisTick += 1;
      state.totals.failed += 1;
      pushLog(state, {
        id: req.id,
        timeMs: state.timeMs,
        status: "failed",
        message: `Request ${req.id} failed: ${req.failureReason}`,
      });
      continue;
    }

    req.lbId = leader.id;
    if (leader.staleHealth) {
      updateHealthSnapshot(leader, state.servers, state.timeMs);
    } else {
      leader.healthSnapshot = Object.fromEntries(
        state.servers.map((server) => [server.id, server.isUp])
      );
    }

    const perceivedAvailable = state.servers
      .filter((server) => leader.healthSnapshot[server.id])
      .map((server) => server.id);

    const algorithm = getAlgorithm(state.algorithmId);
    const selection = algorithm.select({
      servers: state.servers,
      availableIds: perceivedAvailable,
      rrIndex: state.rrIndex,
    });

    if (selection.rrIndex !== undefined) {
      state.rrIndex = selection.rrIndex;
    }

    if (!selection.serverId) {
      req.failureReason = selection.reason;
      failedThisTick += 1;
      state.totals.failed += 1;
      pushLog(state, {
        id: req.id,
        timeMs: state.timeMs,
        status: "failed",
        message: `Request ${req.id} failed: ${req.failureReason}`,
      });
      continue;
    }

    const server = state.servers.find((item) => item.id === selection.serverId);
    req.serverId = selection.serverId;
    req.algorithmId = state.algorithmId;
    req.decisionReason = selection.reason;

    if (!server) {
      req.failureReason = "server not found";
      failedThisTick += 1;
      state.totals.failed += 1;
      pushLog(state, {
        id: req.id,
        timeMs: state.timeMs,
        status: "failed",
        message: `Request ${req.id} failed: ${req.failureReason}`,
      });
      continue;
    }

    if (!server.isUp) {
      req.failureReason = leader.staleHealth
        ? "server down (stale health)"
        : "server down";
      failedThisTick += 1;
      state.totals.failed += 1;
      pushLog(state, {
        id: req.id,
        timeMs: state.timeMs,
        status: "failed",
        message: `Request ${req.id} failed: ${req.failureReason}`,
      });
      continue;
    }

    if (Math.random() < server.dropRate) {
      req.failureReason = "dropped by server";
      failedThisTick += 1;
      state.totals.failed += 1;
      pushLog(state, {
        id: req.id,
        timeMs: state.timeMs,
        status: "failed",
        message: `Request ${req.id} failed: ${req.failureReason}`,
      });
      continue;
    }

    const decisionLatency = leader.decisionLatencyMs;
    const baseLatency = server.baseLatencyMs * server.slowFactor;
    const serviceTime = Math.max(10, baseLatency + sampleJitter(server));
    req.serviceTimeMs = serviceTime + decisionLatency;
    req.remainingTimeMs = req.serviceTimeMs;

    if (server.inflight.length < server.maxConnections) {
      req.status = "started";
      req.startTimeMs = state.timeMs;
      server.inflight.push(req);
      state.totals.started += 1;
      pushLog(state, {
        id: req.id,
        timeMs: state.timeMs,
        status: "started",
        message: `Request ${req.id} -> ${server.id} (${selection.reason})`,
      });
    } else if (server.queue.length < server.queueLimit) {
      req.status = "queued";
      server.queue.push(req);
      pushLog(state, {
        id: req.id,
        timeMs: state.timeMs,
        status: "queued",
        message: `Request ${req.id} queued on ${server.id} (${selection.reason})`,
      });
    } else {
      req.status = "failed";
      req.failureReason = "queue full";
      failedThisTick += 1;
      state.totals.failed += 1;
      pushLog(state, {
        id: req.id,
        timeMs: state.timeMs,
        status: "failed",
        message: `Request ${req.id} failed: ${req.failureReason}`,
      });
    }
  }

  const totalInflight = state.servers.reduce(
    (sum, server) => sum + server.inflight.length,
    0
  );
  const totalQueued = state.servers.reduce(
    (sum, server) => sum + server.queue.length,
    0
  );

  const avgLatency = computeAvgLatency(state.recentLatencies);
  const totalProcessed = completedThisTick + failedThisTick;
  const failureRate = totalProcessed
    ? (failedThisTick / totalProcessed) * 100
    : 0;

  const point: MetricsPoint = {
    timeMs: state.timeMs,
    avgLatencyMs: avgLatency,
    queueDepth: totalQueued,
    inflight: totalInflight,
    failureRate,
  };

  state.metrics.push(point);
  if (state.metrics.length > METRICS_LIMIT) {
    state.metrics.splice(0, state.metrics.length - METRICS_LIMIT);
  }

  return state;
};

export const createInitialState = (): SimulationState => {
  const servers: ServerState[] = [
    {
      id: "srv-1",
      name: "Server 1",
      isUp: true,
      maxConnections: 12,
      queueLimit: 18,
      baseLatencyMs: 160,
      jitterMs: 30,
      slowFactor: 1,
      dropRate: 0,
      inflight: [],
      queue: [],
    },
    {
      id: "srv-2",
      name: "Server 2",
      isUp: true,
      maxConnections: 10,
      queueLimit: 16,
      baseLatencyMs: 180,
      jitterMs: 35,
      slowFactor: 1,
      dropRate: 0,
      inflight: [],
      queue: [],
    },
    {
      id: "srv-3",
      name: "Server 3",
      isUp: true,
      maxConnections: 14,
      queueLimit: 20,
      baseLatencyMs: 140,
      jitterMs: 25,
      slowFactor: 1,
      dropRate: 0,
      inflight: [],
      queue: [],
    },
  ];

  const loadBalancers: LoadBalancerState[] = [
    {
      id: "lb-1",
      name: "LB Alpha",
      isUp: true,
      decisionLatencyMs: 8,
      staleHealth: false,
      healthIntervalMs: 3000,
      lastHealthCheckMs: 0,
      healthSnapshot: Object.fromEntries(
        servers.map((server) => [server.id, server.isUp])
      ),
    },
  ];

  return {
    timeMs: 0,
    nextRequestId: 1,
    pendingRemainder: 0,
    recentLatencies: [],
    algorithmId: "round-robin",
    workloadId: "steady",
    rrIndex: 0,
    servers,
    loadBalancers,
    leaderLbId: "lb-1",
    log: [],
    metrics: [],
    totals: {
      completed: 0,
      failed: 0,
      started: 0,
    },
  };
};
