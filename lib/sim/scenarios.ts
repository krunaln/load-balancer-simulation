import type {
  AlgorithmId,
  LoadBalancerState,
  ServerState,
  SimulationState,
  WorkloadId,
} from "./types";
import { createInitialState } from "./simulator";

type ServerConfig = Pick<
  ServerState,
  | "id"
  | "name"
  | "health"
  | "baseLatencyMs"
  | "slowMultiplier"
  | "weight"
  | "maxConcurrentRequests"
  | "serverQueueSize"
>;

type LbConfig = Pick<
  LoadBalancerState,
  | "id"
  | "name"
  | "isUp"
  | "maxConnectionsPerSecond"
  | "maxConcurrentConnections"
  | "queueSize"
  | "routingAlgorithm"
>;

export type Scenario = {
  id: string;
  algorithmId: AlgorithmId;
  workloadId: WorkloadId;
  name: string;
  summary: string;
  setup: string[];
  whatHappens: string[];
  teaches: string[];
  narration: NarrationStep[];
  servers: ServerConfig[];
  loadBalancers: LbConfig[];
};

export type NarrationTarget =
  | "client"
  | "lb"
  | "server"
  | "edge-client-lb"
  | "edge-lb-server"
  | "general";

export type NarrationStep = {
  id: string;
  text: string;
  target?: NarrationTarget;
  serverId?: string;
  lbId?: string;
};

export const scenarios: Scenario[] = [
  {
    id: "rr-homogeneous",
    algorithmId: "round-robin",
    workloadId: "steady",
    name: "Homogeneous stateless API",
    summary: "Round robin with identical servers under steady load.",
    setup: [
      "3 servers, max concurrent 10 each",
      "Latency 100ms each",
      "Steady 30 RPS",
    ],
    whatHappens: [
      "Requests distribute evenly (10/10/10)",
      "Queues stay near zero",
      "Latency stays flat",
    ],
    teaches: [
      "RR works when servers are identical",
      "No load awareness",
      "Deterministic and simple",
    ],
    narration: [
      {
        id: "rr-1",
        text: "Clients generate steady traffic into the load balancer queue.",
        target: "client",
      },
      {
        id: "rr-2",
        text: "Round robin sends requests in strict order, ignoring current load.",
        target: "lb",
      },
      {
        id: "rr-3",
        text: "Requests flow evenly to each server because capacities match.",
        target: "edge-lb-server",
      },
      {
        id: "rr-4",
        text: "Latency stays flat since queues remain near zero.",
        target: "server",
        serverId: "srv-1",
      },
    ],
    servers: [
      {
        id: "srv-1",
        name: "Server 1",
        health: "UP",
        baseLatencyMs: 100,
        slowMultiplier: 1.8,
        weight: 1,
        maxConcurrentRequests: 10,
        serverQueueSize: 12,
      },
      {
        id: "srv-2",
        name: "Server 2",
        health: "UP",
        baseLatencyMs: 100,
        slowMultiplier: 1.8,
        weight: 1,
        maxConcurrentRequests: 10,
        serverQueueSize: 12,
      },
      {
        id: "srv-3",
        name: "Server 3",
        health: "UP",
        baseLatencyMs: 100,
        slowMultiplier: 1.8,
        weight: 1,
        maxConcurrentRequests: 10,
        serverQueueSize: 12,
      },
    ],
    loadBalancers: [
      {
        id: "lb-1",
        name: "LB Alpha",
        isUp: true,
        maxConnectionsPerSecond: 40,
        maxConcurrentConnections: 60,
        queueSize: 80,
        routingAlgorithm: "round-robin",
      },
    ],
  },
  {
    id: "rr-slow-server",
    algorithmId: "round-robin",
    workloadId: "steady",
    name: "Slow server shows RR weakness",
    summary: "Server 2 is slower but RR still sends it equal traffic.",
    setup: [
      "Server 2 latency 300ms, others 100ms",
      "Steady 30 RPS",
      "Same concurrency limits",
    ],
    whatHappens: [
      "RR keeps sending equal traffic",
      "Server 2 queues build",
      "Overall latency and p95 spike",
    ],
    teaches: [
      "RR ignores performance",
      "Slow nodes hurt tail latency",
    ],
    narration: [
      {
        id: "rr-slow-1",
        text: "Round robin keeps sending equal traffic to all servers.",
        target: "edge-lb-server",
      },
      {
        id: "rr-slow-2",
        text: "Server 2 is slow, so its queue builds while others stay clear.",
        target: "server",
        serverId: "srv-2",
      },
      {
        id: "rr-slow-3",
        text: "Tail latency spikes because slow queues dominate completion times.",
        target: "general",
      },
    ],
    servers: [
      {
        id: "srv-1",
        name: "Server 1",
        health: "UP",
        baseLatencyMs: 100,
        slowMultiplier: 1.8,
        weight: 1,
        maxConcurrentRequests: 10,
        serverQueueSize: 12,
      },
      {
        id: "srv-2",
        name: "Server 2",
        health: "SLOW",
        baseLatencyMs: 200,
        slowMultiplier: 1.8,
        weight: 1,
        maxConcurrentRequests: 10,
        serverQueueSize: 12,
      },
      {
        id: "srv-3",
        name: "Server 3",
        health: "UP",
        baseLatencyMs: 100,
        slowMultiplier: 1.8,
        weight: 1,
        maxConcurrentRequests: 10,
        serverQueueSize: 12,
      },
    ],
    loadBalancers: [
      {
        id: "lb-1",
        name: "LB Alpha",
        isUp: true,
        maxConnectionsPerSecond: 40,
        maxConcurrentConnections: 60,
        queueSize: 80,
        routingAlgorithm: "round-robin",
      },
    ],
  },
  {
    id: "wrr-weighted-traffic",
    algorithmId: "weighted-round-robin",
    workloadId: "steady",
    name: "Weighted RR with bigger node",
    summary: "Weighted RR sends more traffic to higher-capacity server.",
    setup: [
      "Server 1 weight 2",
      "Other servers weight 1",
      "Steady 30 RPS",
    ],
    whatHappens: [
      "Server 1 receives ~2x requests",
      "Queues stay balanced",
      "Latency stays stable",
    ],
    teaches: [
      "Weights map to capacity",
      "Still no latency awareness",
    ],
    narration: [
      {
        id: "wrr-1",
        text: "Weighted round robin allocates more turns to higher weight servers.",
        target: "lb",
      },
      {
        id: "wrr-2",
        text: "Server 1 gets more traffic because its weight is higher.",
        target: "server",
        serverId: "srv-1",
      },
      {
        id: "wrr-3",
        text: "Queues stay balanced because weight matches capacity.",
        target: "edge-lb-server",
      },
    ],
    servers: [
      {
        id: "srv-1",
        name: "Server 1",
        health: "UP",
        baseLatencyMs: 100,
        slowMultiplier: 1.8,
        weight: 2,
        maxConcurrentRequests: 14,
        serverQueueSize: 14,
      },
      {
        id: "srv-2",
        name: "Server 2",
        health: "UP",
        baseLatencyMs: 100,
        slowMultiplier: 1.8,
        weight: 1,
        maxConcurrentRequests: 10,
        serverQueueSize: 12,
      },
      {
        id: "srv-3",
        name: "Server 3",
        health: "UP",
        baseLatencyMs: 100,
        slowMultiplier: 1.8,
        weight: 1,
        maxConcurrentRequests: 10,
        serverQueueSize: 12,
      },
    ],
    loadBalancers: [
      {
        id: "lb-1",
        name: "LB Alpha",
        isUp: true,
        maxConnectionsPerSecond: 40,
        maxConcurrentConnections: 60,
        queueSize: 80,
        routingAlgorithm: "weighted-round-robin",
      },
    ],
  },
  {
    id: "ewma-latency",
    algorithmId: "ewma",
    workloadId: "steady",
    name: "EWMA avoids slow node",
    summary: "EWMA steers away from high-latency server over time.",
    setup: [
      "Server 2 starts SLOW",
      "Steady 30 RPS",
    ],
    whatHappens: [
      "EWMA learns latency profile",
      "Traffic shifts away from slow server",
      "Tail latency improves",
    ],
    teaches: [
      "Latency-aware routing",
      "EWMA smooths noise",
    ],
    narration: [
      {
        id: "ewma-1",
        text: "EWMA starts with baseline latency estimates for each server.",
        target: "lb",
      },
      {
        id: "ewma-2",
        text: "Server 2 latency rises, increasing its EWMA score.",
        target: "server",
        serverId: "srv-2",
      },
      {
        id: "ewma-3",
        text: "Traffic shifts toward faster servers as EWMA adapts.",
        target: "edge-lb-server",
      },
    ],
    servers: [
      {
        id: "srv-1",
        name: "Server 1",
        health: "UP",
        baseLatencyMs: 100,
        slowMultiplier: 1.8,
        weight: 1,
        maxConcurrentRequests: 10,
        serverQueueSize: 12,
      },
      {
        id: "srv-2",
        name: "Server 2",
        health: "SLOW",
        baseLatencyMs: 220,
        slowMultiplier: 1.8,
        weight: 1,
        maxConcurrentRequests: 10,
        serverQueueSize: 12,
      },
      {
        id: "srv-3",
        name: "Server 3",
        health: "UP",
        baseLatencyMs: 100,
        slowMultiplier: 1.8,
        weight: 1,
        maxConcurrentRequests: 10,
        serverQueueSize: 12,
      },
    ],
    loadBalancers: [
      {
        id: "lb-1",
        name: "LB Alpha",
        isUp: true,
        maxConnectionsPerSecond: 40,
        maxConcurrentConnections: 60,
        queueSize: 80,
        routingAlgorithm: "ewma",
      },
    ],
  },
  {
    id: "p2c-burst",
    algorithmId: "p2c",
    workloadId: "burst",
    name: "P2C under burst traffic",
    summary: "P2C mitigates hot spots during bursts.",
    setup: [
      "Burst traffic",
      "3 servers identical",
    ],
    whatHappens: [
      "Two-choice comparison reduces queue build-up",
      "Less variance than RR",
    ],
    teaches: [
      "Simple heuristic reduces hotspots",
    ],
    narration: [
      {
        id: "p2c-1",
        text: "Power of Two Choices samples two servers per request.",
        target: "lb",
      },
      {
        id: "p2c-2",
        text: "The lower-queue server is chosen, preventing hotspots.",
        target: "edge-lb-server",
      },
    ],
    servers: [
      {
        id: "srv-1",
        name: "Server 1",
        health: "UP",
        baseLatencyMs: 100,
        slowMultiplier: 1.8,
        weight: 1,
        maxConcurrentRequests: 10,
        serverQueueSize: 12,
      },
      {
        id: "srv-2",
        name: "Server 2",
        health: "UP",
        baseLatencyMs: 100,
        slowMultiplier: 1.8,
        weight: 1,
        maxConcurrentRequests: 10,
        serverQueueSize: 12,
      },
      {
        id: "srv-3",
        name: "Server 3",
        health: "UP",
        baseLatencyMs: 100,
        slowMultiplier: 1.8,
        weight: 1,
        maxConcurrentRequests: 10,
        serverQueueSize: 12,
      },
    ],
    loadBalancers: [
      {
        id: "lb-1",
        name: "LB Alpha",
        isUp: true,
        maxConnectionsPerSecond: 40,
        maxConcurrentConnections: 60,
        queueSize: 80,
        routingAlgorithm: "p2c",
      },
    ],
  },
  {
    id: "lc-uneven-load",
    algorithmId: "least-connections",
    workloadId: "steady",
    name: "Least connections stabilizes load",
    summary: "Least connections sends work to the least busy server.",
    setup: [
      "3 servers identical",
      "Steady 30 RPS",
    ],
    whatHappens: [
      "Least-connections favors idle servers",
      "Queue lengths stay balanced",
    ],
    teaches: [
      "Simple load awareness improves balance",
      "Still sensitive to slow nodes without latency weighting",
    ],
    narration: [
      {
        id: "lc-1",
        text: "Least connections checks which server has the fewest active requests.",
        target: "lb",
      },
      {
        id: "lc-2",
        text: "Requests flow toward less busy servers in real time.",
        target: "edge-lb-server",
      },
    ],
    servers: [
      {
        id: "srv-1",
        name: "Server 1",
        health: "UP",
        baseLatencyMs: 110,
        slowMultiplier: 1.8,
        weight: 1,
        maxConcurrentRequests: 10,
        serverQueueSize: 12,
      },
      {
        id: "srv-2",
        name: "Server 2",
        health: "UP",
        baseLatencyMs: 110,
        slowMultiplier: 1.8,
        weight: 1,
        maxConcurrentRequests: 10,
        serverQueueSize: 12,
      },
      {
        id: "srv-3",
        name: "Server 3",
        health: "UP",
        baseLatencyMs: 110,
        slowMultiplier: 1.8,
        weight: 1,
        maxConcurrentRequests: 10,
        serverQueueSize: 12,
      },
    ],
    loadBalancers: [
      {
        id: "lb-1",
        name: "LB Alpha",
        isUp: true,
        maxConnectionsPerSecond: 40,
        maxConcurrentConnections: 60,
        queueSize: 80,
        routingAlgorithm: "least-connections",
      },
    ],
  },
];

export const buildStateFromScenario = (scenario: Scenario): SimulationState => {
  const base = createInitialState();

  const servers: ServerState[] = scenario.servers.map((server) => ({
    ...server,
    inflight: [],
    queue: [],
    totalProcessed: 0,
    totalFailed: 0,
    ewmaLatencyMs: server.baseLatencyMs,
    circuitBreakerUntilMs: 0,
    lastHealthChangeMs: 0,
  }));

  const loadBalancers: LoadBalancerState[] = scenario.loadBalancers.map((lb) => ({
    ...lb,
    droppedRequests: 0,
    queue: [],
    activeConnections: 0,
    healthIntervalMs: base.healthCheckIntervalMs,
    lastHealthCheckMs: base.timeMs,
    healthSnapshot: Object.fromEntries(
      servers.map((server) => [server.id, server.health !== "DOWN"])
    ),
  }));

  return {
    ...base,
    algorithmId: scenario.algorithmId,
    workloadId: scenario.workloadId,
    servers,
    loadBalancers,
    leaderLbId: loadBalancers[0]?.id ?? null,
  };
};
