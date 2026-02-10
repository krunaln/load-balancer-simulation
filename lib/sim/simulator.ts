import { getAlgorithm } from "./algorithms";
import { getWorkload } from "./workloads";
import type {
  LoadBalancerState,
  MetricsPoint,
  Request,
  ServerState,
  SimulationState,
} from "./types";

const LOG_LIMIT = 260;
const METRICS_LIMIT = 160;
const SAMPLE_LIMIT = 260;

const cloneServer = (server: ServerState): ServerState => ({
  ...server,
  inflight: [...server.inflight],
  queue: [...server.queue],
});

const cloneLb = (lb: LoadBalancerState): LoadBalancerState => ({
  ...lb,
  queue: [...lb.queue],
  healthSnapshot: { ...lb.healthSnapshot },
});

const pushLog = (state: SimulationState, entry: SimulationState["log"][0]) => {
  state.log.push(entry);
  if (state.log.length > LOG_LIMIT) {
    state.log.splice(0, state.log.length - LOG_LIMIT);
  }
};

const pushSample = (values: number[], value: number) => {
  values.push(value);
  if (values.length > SAMPLE_LIMIT) {
    values.splice(0, values.length - SAMPLE_LIMIT);
  }
};

const avg = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

const p95 = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[index];
};

const electLeader = (loadBalancers: LoadBalancerState[]) =>
  loadBalancers.find((lb) => lb.isUp) ?? null;

const isServerAvailable = (server: ServerState, timeMs: number) => {
  if (server.health === "DOWN") return false;
  if (server.circuitBreakerUntilMs > timeMs) return false;
  const capacityOpen = server.inflight.length < server.maxConcurrentRequests;
  const queueOpen = server.queue.length < server.serverQueueSize;
  return capacityOpen || queueOpen;
};

const updateHealthSnapshot = (
  lb: LoadBalancerState,
  servers: ServerState[],
  timeMs: number,
  intervalMs: number,
  recoveryDelayMs: number
) => {
  if (timeMs - lb.lastHealthCheckMs < intervalMs) return;
  lb.lastHealthCheckMs = timeMs;

  for (const server of servers) {
    if (server.health === "DOWN") {
      if (timeMs - server.lastHealthChangeMs >= recoveryDelayMs) {
        server.health = "UP";
        server.lastHealthChangeMs = timeMs;
      }
    }
  }

  lb.healthSnapshot = Object.fromEntries(
    servers.map((server) => [
      server.id,
      server.health !== "DOWN" && server.circuitBreakerUntilMs <= timeMs,
    ])
  );
};

const computeProcessingTime = (
  server: ServerState,
  alpha: number
): number => {
  const utilization =
    server.maxConcurrentRequests === 0
      ? 1
      : server.inflight.length / server.maxConcurrentRequests;
  const multiplier =
    server.health === "SLOW" ? server.slowMultiplier : 1;
  return server.baseLatencyMs * multiplier * (1 + alpha * utilization ** 2);
};

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
    recentLbWaits: [...prev.recentLbWaits],
    recentServerWaits: [...prev.recentServerWaits],
    totals: { ...prev.totals },
  };

  for (const lb of state.loadBalancers) {
    lb.activeConnections = 0;
  }

  const workload = getWorkload(state.workloadId);
  const arrivalRate = workload.rateRps(state.timeMs);
  const expected = (arrivalRate * dtMs) / 1000;
  const arrivals = Math.floor(state.pendingRemainder + expected);
  state.pendingRemainder = state.pendingRemainder + expected - arrivals;

  const ensureLeader = () => {
    const current = state.loadBalancers.find((lb) => lb.id === state.leaderLbId);
    if (current && current.isUp) return current;
    const replacement = electLeader(state.loadBalancers);
    state.leaderLbId = replacement?.id ?? null;
    return replacement;
  };

  const leader = ensureLeader();

  for (const lb of state.loadBalancers) {
    updateHealthSnapshot(
      lb,
      state.servers,
      state.timeMs,
      state.healthCheckIntervalMs,
      state.recoveryDelayMs
    );
  }

  for (let i = 0; i < arrivals; i += 1) {
    const requestId = state.nextRequestId++;
    const req: Request = {
      id: requestId,
      arrivalTimeMs: state.timeMs,
      lbQueueEnterMs: state.timeMs,
      status: "arrived",
    };

    if (!leader || !leader.isUp) {
      req.status = "failed";
      req.failureReason = "load balancer unavailable";
      state.totals.failed += 1;
      pushLog(state, {
        id: req.id,
        timeMs: state.timeMs,
        status: "failed",
        message: `Request ${req.id} failed: ${req.failureReason}`,
        lbId: leader?.id,
      });
      continue;
    }

    if (leader.queue.length >= leader.queueSize) {
      leader.droppedRequests += 1;
      state.totals.droppedLb += 1;
      req.status = "failed";
      req.failureReason = "lb queue full (503)";
      pushLog(state, {
        id: req.id,
        timeMs: state.timeMs,
        status: "failed",
        message: `Request ${req.id} rejected: ${req.failureReason}`,
        lbId: leader.id,
      });
      continue;
    }

    req.status = "lb-queued";
    leader.queue.push(req);
  }

  if (leader && leader.isUp) {
    const maxPerTick = Math.max(
      0,
      Math.floor((leader.maxConnectionsPerSecond * dtMs) / 1000)
    );
    let routedThisTick = 0;

    while (
      leader.queue.length &&
      routedThisTick < maxPerTick &&
      leader.activeConnections < leader.maxConcurrentConnections
    ) {
      const req = leader.queue.shift();
      if (!req) break;
      req.lbQueueExitMs = state.timeMs;
      req.lbQueueWaitMs = req.lbQueueExitMs - (req.lbQueueEnterMs ?? req.arrivalTimeMs);
      pushSample(state.recentLbWaits, req.lbQueueWaitMs);

      const algorithm = getAlgorithm(leader.routingAlgorithm ?? state.algorithmId);
      const availableIds = state.servers
        .filter((server) =>
          leader.healthSnapshot[server.id] &&
          isServerAvailable(server, state.timeMs)
        )
        .map((server) => server.id);

      const selection = algorithm.select({
        servers: state.servers,
        availableIds,
        rrIndex: state.rrIndex,
        requestId: req.id,
      });

      if (selection.rrIndex !== undefined) {
        state.rrIndex = selection.rrIndex;
      }

      if (!selection.serverId) {
        req.status = "failed";
        req.failureReason = selection.reason;
        state.totals.failed += 1;
        pushLog(state, {
          id: req.id,
          timeMs: state.timeMs,
          status: "failed",
          message: `Request ${req.id} failed: ${req.failureReason}`,
          lbId: leader.id,
        });
        continue;
      }

      const server = state.servers.find((item) => item.id === selection.serverId);
      if (!server) {
        req.status = "failed";
        req.failureReason = "server not found";
        state.totals.failed += 1;
        pushLog(state, {
          id: req.id,
          timeMs: state.timeMs,
          status: "failed",
          message: `Request ${req.id} failed: ${req.failureReason}`,
          lbId: leader.id,
        });
        continue;
      }

      if (!isServerAvailable(server, state.timeMs)) {
        req.status = "failed";
        req.failureReason = "server unavailable";
        state.totals.failed += 1;
        server.totalFailed += 1;
        pushLog(state, {
          id: req.id,
          timeMs: state.timeMs,
          status: "failed",
          message: `Request ${req.id} failed: ${req.failureReason}`,
          lbId: leader.id,
          serverId: server.id,
        });
        continue;
      }

      req.lbId = leader.id;
      req.serverId = server.id;
      req.algorithmId = algorithm.id;
      req.decisionReason = selection.reason;

      leader.activeConnections += 1;
      routedThisTick += 1;

      if (server.inflight.length < server.maxConcurrentRequests) {
        req.startProcessingMs = state.timeMs;
        req.processingTimeMs = computeProcessingTime(server, state.ewmaAlpha);
        req.remainingTimeMs = req.processingTimeMs;
        req.status = "processing";
        server.inflight.push(req);
        state.totals.started += 1;
        pushLog(state, {
          id: req.id,
          timeMs: state.timeMs,
          status: "processing",
          message: `Request ${req.id} -> ${server.id} (${selection.reason})`,
          lbId: leader.id,
          serverId: server.id,
        });
      } else if (server.queue.length < server.serverQueueSize) {
        req.serverQueueEnterMs = state.timeMs;
        req.status = "server-queued";
        server.queue.push(req);
        pushLog(state, {
          id: req.id,
          timeMs: state.timeMs,
          status: "server-queued",
          message: `Request ${req.id} queued on ${server.id} (${selection.reason})`,
          lbId: leader.id,
          serverId: server.id,
        });
      } else {
        req.status = "failed";
        req.failureReason = "server queue full (503)";
        state.totals.failed += 1;
        state.totals.droppedServer += 1;
        server.totalFailed += 1;
        server.circuitBreakerUntilMs = state.timeMs + state.recoveryDelayMs;
        pushLog(state, {
          id: req.id,
          timeMs: state.timeMs,
          status: "failed",
          message: `Request ${req.id} failed: ${req.failureReason}`,
          lbId: leader.id,
          serverId: server.id,
        });
        leader.activeConnections = Math.max(0, leader.activeConnections - 1);
      }
    }
  }

  for (const server of state.servers) {
    while (
      server.queue.length &&
      server.inflight.length < server.maxConcurrentRequests
    ) {
      const req = server.queue.shift();
      if (!req) break;
      req.serverQueueExitMs = state.timeMs;
      req.serverQueueWaitMs =
        (req.serverQueueExitMs ?? state.timeMs) -
        (req.serverQueueEnterMs ?? state.timeMs);
      pushSample(state.recentServerWaits, req.serverQueueWaitMs);

      req.startProcessingMs = state.timeMs;
      req.processingTimeMs = computeProcessingTime(server, state.ewmaAlpha);
      req.remainingTimeMs = req.processingTimeMs;
      req.status = "processing";
      server.inflight.push(req);
      state.totals.started += 1;
    }

    const stillInflight: Request[] = [];
    for (const req of server.inflight) {
      if (req.remainingTimeMs === undefined) {
        req.remainingTimeMs = 0;
      }
      req.remainingTimeMs -= dtMs;
      if (req.remainingTimeMs <= 0) {
        req.endTimeMs = state.timeMs;
        req.status = "completed";
        req.lbQueueWaitMs =
          (req.lbQueueExitMs ?? state.timeMs) -
          (req.lbQueueEnterMs ?? req.arrivalTimeMs);
        req.serverQueueWaitMs =
          (req.serverQueueExitMs ?? state.timeMs) -
          (req.serverQueueEnterMs ?? req.startProcessingMs ?? state.timeMs);
        req.processingTimeMs = req.processingTimeMs ?? 0;
        req.latencyMs = req.endTimeMs - req.arrivalTimeMs;

        pushSample(state.recentLatencies, req.latencyMs);
        pushSample(state.recentLbWaits, req.lbQueueWaitMs);
        pushSample(state.recentServerWaits, req.serverQueueWaitMs);

        server.totalProcessed += 1;
        state.totals.completed += 1;
        server.ewmaLatencyMs =
          state.ewmaAlpha * (req.latencyMs ?? 0) +
          (1 - state.ewmaAlpha) * server.ewmaLatencyMs;

        const lb = state.loadBalancers.find((item) => item.id === req.lbId);
        if (lb) {
          lb.activeConnections = Math.max(0, lb.activeConnections - 1);
        }

        pushLog(state, {
          id: req.id,
          timeMs: state.timeMs,
          status: "completed",
          message: `Request ${req.id} completed on ${server.id} in ${Math.round(
            req.latencyMs
          )}ms`,
          lbId: req.lbId,
          serverId: server.id,
        });
      } else {
        stillInflight.push(req);
      }
    }
    server.inflight = stillInflight;
  }

  const totalInflight = state.servers.reduce(
    (sum, server) => sum + server.inflight.length,
    0
  );
  const totalServerQueued = state.servers.reduce(
    (sum, server) => sum + server.queue.length,
    0
  );
  const totalLbQueued = state.loadBalancers.reduce(
    (sum, lb) => sum + lb.queue.length,
    0
  );

  const avgLatency = avg(state.recentLatencies);
  const p95Latency = p95(state.recentLatencies);
  const failureTotal = state.totals.failed + state.totals.droppedLb + state.totals.droppedServer;
  const totalProcessed = state.totals.completed + failureTotal;
  const failureRate = totalProcessed ? (failureTotal / totalProcessed) * 100 : 0;

  const point: MetricsPoint = {
    timeMs: state.timeMs,
    avgLatencyMs: avgLatency,
    p95LatencyMs: p95Latency,
    lbQueueDepth: totalLbQueued,
    serverQueueDepth: totalServerQueued,
    inflight: totalInflight,
    failureRate,
    dropsLb: state.totals.droppedLb,
    dropsServer: state.totals.droppedServer,
    avgLbWaitMs: avg(state.recentLbWaits),
    avgServerWaitMs: avg(state.recentServerWaits),
  };

  state.metrics.push(point);
  if (state.metrics.length > METRICS_LIMIT) {
    state.metrics.splice(0, state.metrics.length - METRICS_LIMIT);
  }

  return state;
};

export const createInitialState = (): SimulationState => {
  const tickMs = 1000;
  const servers: ServerState[] = [
    {
      id: "srv-1",
      name: "Server 1",
      health: "UP",
      baseLatencyMs: 160,
      slowMultiplier: 1.8,
      weight: 1,
      maxConcurrentRequests: 12,
      serverQueueSize: 18,
      inflight: [],
      queue: [],
      totalProcessed: 0,
      totalFailed: 0,
      ewmaLatencyMs: 180,
      circuitBreakerUntilMs: 0,
      lastHealthChangeMs: 0,
    },
    {
      id: "srv-2",
      name: "Server 2",
      health: "UP",
      baseLatencyMs: 190,
      slowMultiplier: 1.8,
      weight: 1,
      maxConcurrentRequests: 10,
      serverQueueSize: 16,
      inflight: [],
      queue: [],
      totalProcessed: 0,
      totalFailed: 0,
      ewmaLatencyMs: 200,
      circuitBreakerUntilMs: 0,
      lastHealthChangeMs: 0,
    },
    {
      id: "srv-3",
      name: "Server 3",
      health: "UP",
      baseLatencyMs: 140,
      slowMultiplier: 1.8,
      weight: 1,
      maxConcurrentRequests: 14,
      serverQueueSize: 20,
      inflight: [],
      queue: [],
      totalProcessed: 0,
      totalFailed: 0,
      ewmaLatencyMs: 170,
      circuitBreakerUntilMs: 0,
      lastHealthChangeMs: 0,
    },
  ];

  const loadBalancers: LoadBalancerState[] = [
    {
      id: "lb-1",
      name: "LB Alpha",
      isUp: true,
      maxConnectionsPerSecond: 40,
      maxConcurrentConnections: 60,
      queueSize: 120,
      droppedRequests: 0,
      queue: [],
      activeConnections: 0,
      routingAlgorithm: "round-robin",
      healthIntervalMs: 3000,
      lastHealthCheckMs: 0,
      healthSnapshot: Object.fromEntries(
        servers.map((server) => [server.id, server.health !== "DOWN"])
      ),
    },
  ];

  return {
    timeMs: 0,
    tickMs,
    nextRequestId: 1,
    pendingRemainder: 0,
    recentLatencies: [],
    recentLbWaits: [],
    recentServerWaits: [],
    algorithmId: "round-robin",
    workloadId: "steady",
    rrIndex: 0,
    ewmaAlpha: 0.2,
    loadBalancers,
    leaderLbId: "lb-1",
    servers,
    log: [],
    metrics: [],
    totals: {
      completed: 0,
      failed: 0,
      started: 0,
      droppedLb: 0,
      droppedServer: 0,
    },
    healthCheckIntervalMs: 3000,
    recoveryDelayMs: 8000,
  };
};
