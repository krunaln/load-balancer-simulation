export type AlgorithmId =
  | "round-robin"
  | "least-connections"
  | "weighted-round-robin"
  | "ewma"
  | "p2c";
export type WorkloadId = "steady" | "burst";

export type RequestStatus =
  | "arrived"
  | "lb-queued"
  | "server-queued"
  | "processing"
  | "completed"
  | "failed";

export type ServerHealth = "UP" | "SLOW" | "DOWN";

export type Request = {
  id: number;
  arrivalTimeMs: number;
  lbQueueEnterMs?: number;
  lbQueueExitMs?: number;
  serverQueueEnterMs?: number;
  serverQueueExitMs?: number;
  startProcessingMs?: number;
  endTimeMs?: number;
  serviceTimeMs?: number;
  remainingTimeMs?: number;
  serverId?: string;
  lbId?: string;
  algorithmId?: AlgorithmId;
  decisionReason?: string;
  status: RequestStatus;
  failureReason?: string;
  latencyMs?: number;
  lbQueueWaitMs?: number;
  serverQueueWaitMs?: number;
  processingTimeMs?: number;
};

export type ServerState = {
  id: string;
  name: string;
  health: ServerHealth;
  baseLatencyMs: number;
  slowMultiplier: number;
  weight: number;
  maxConcurrentRequests: number;
  serverQueueSize: number;
  inflight: Request[];
  queue: Request[];
  totalProcessed: number;
  totalFailed: number;
  ewmaLatencyMs: number;
  circuitBreakerUntilMs: number;
  lastHealthChangeMs: number;
};

export type LoadBalancerState = {
  id: string;
  name: string;
  isUp: boolean;
  maxConnectionsPerSecond: number;
  maxConcurrentConnections: number;
  queueSize: number;
  droppedRequests: number;
  queue: Request[];
  activeConnections: number;
  routingAlgorithm: AlgorithmId;
  healthIntervalMs: number;
  lastHealthCheckMs: number;
  healthSnapshot: Record<string, boolean>;
};

export type LogEntry = {
  id: number;
  timeMs: number;
  status: RequestStatus;
  message: string;
  serverId?: string;
  lbId?: string;
};

export type MetricsPoint = {
  timeMs: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  lbQueueDepth: number;
  serverQueueDepth: number;
  inflight: number;
  failureRate: number;
  dropsLb: number;
  dropsServer: number;
  avgLbWaitMs: number;
  avgServerWaitMs: number;
};

export type SimulationState = {
  timeMs: number;
  tickMs: number;
  nextRequestId: number;
  pendingRemainder: number;
  recentLatencies: number[];
  recentLbWaits: number[];
  recentServerWaits: number[];
  algorithmId: AlgorithmId;
  workloadId: WorkloadId;
  rrIndex: number;
  ewmaAlpha: number;
  loadBalancers: LoadBalancerState[];
  leaderLbId: string | null;
  servers: ServerState[];
  log: LogEntry[];
  metrics: MetricsPoint[];
  totals: {
    completed: number;
    failed: number;
    started: number;
    droppedLb: number;
    droppedServer: number;
  };
  healthCheckIntervalMs: number;
  recoveryDelayMs: number;
};
