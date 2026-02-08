export type AlgorithmId = "round-robin" | "least-connections";
export type WorkloadId = "steady" | "burst";

export type RequestStatus = "started" | "queued" | "failed" | "completed";

export type Request = {
  id: number;
  arrivalTimeMs: number;
  startTimeMs?: number;
  serviceTimeMs: number;
  remainingTimeMs: number;
  serverId?: string;
  status: RequestStatus;
  failureReason?: string;
  lbId?: string;
  algorithmId?: AlgorithmId;
  decisionReason?: string;
  latencyMs?: number;
};

export type ServerState = {
  id: string;
  name: string;
  isUp: boolean;
  maxConnections: number;
  queueLimit: number;
  baseLatencyMs: number;
  jitterMs: number;
  slowFactor: number;
  dropRate: number;
  totalProcessed: number;
  totalFailed: number;
  inflight: Request[];
  queue: Request[];
};

export type LoadBalancerState = {
  id: string;
  name: string;
  isUp: boolean;
  currentRequests: number;
  maxThroughputRps: number;
  decisionLatencyMs: number;
  staleHealth: boolean;
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
  queueDepth: number;
  inflight: number;
  failureRate: number;
};

export type SimulationState = {
  timeMs: number;
  nextRequestId: number;
  pendingRemainder: number;
  recentLatencies: number[];
  algorithmId: AlgorithmId;
  workloadId: WorkloadId;
  rrIndex: number;
  servers: ServerState[];
  loadBalancers: LoadBalancerState[];
  leaderLbId: string | null;
  log: LogEntry[];
  metrics: MetricsPoint[];
  totals: {
    completed: number;
    failed: number;
    started: number;
  };
};
