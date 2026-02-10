export type NodeStatus = "UP" | "SLOW" | "DOWN";

export type ScenarioStep = {
  id: string;
  title?: string;
  text: string;
  highlightNodeIds?: string[];
  highlightEdgeIds?: string[];
  stats?: {
    clients?: {
      currentRequests?: number;
      totalRequests?: number;
    };
    lbs?: Record<
      string,
      {
        queueDepth?: number;
        drops?: number;
      }
    >;
    servers?: Record<
      string,
      {
        active?: number;
        processed?: number;
        failed?: number;
        status?: NodeStatus;
      }
    >;
  };
};

export type ScenarioDefinition = {
  id: string;
  algorithm: string;
  name: string;
  summary: string;
  setup: string[];
  teaches: string[];
  base: {
    clients: {
      id: string;
      name: string;
      currentRequests: number;
      totalRequests: number;
    };
    loadBalancers: Array<{
      id: string;
      name: string;
      isLeader?: boolean;
      queueDepth: number;
      drops: number;
    }>;
    servers: Array<{
      id: string;
      name: string;
      status: NodeStatus;
      active: number;
      processed: number;
      failed: number;
    }>;
  };
  steps: ScenarioStep[];
};

export const scenarios: ScenarioDefinition[] = [
  {
    id: "rr-homogeneous",
    algorithm: "Round Robin",
    name: "Homogeneous stateless API",
    summary: "RR distributes evenly when servers are identical.",
    setup: [
      "3 servers, max concurrent 10 each",
      "Latency 100ms each",
      "Steady 30 RPS",
    ],
    teaches: [
      "RR works when servers are identical",
      "No load awareness",
      "Deterministic and simple",
    ],
    base: {
      clients: {
        id: "client-1",
        name: "Clients",
        currentRequests: 0,
        totalRequests: 0,
      },
      loadBalancers: [
        {
          id: "lb-1",
          name: "LB Alpha",
          isLeader: true,
          queueDepth: 0,
          drops: 0,
        },
      ],
      servers: [
        {
          id: "srv-1",
          name: "Server 1",
          status: "UP",
          active: 0,
          processed: 0,
          failed: 0,
        },
        {
          id: "srv-2",
          name: "Server 2",
          status: "UP",
          active: 0,
          processed: 0,
          failed: 0,
        },
        {
          id: "srv-3",
          name: "Server 3",
          status: "UP",
          active: 0,
          processed: 0,
          failed: 0,
        },
      ],
    },
    steps: [
      {
        id: "rr-step-1",
        title: "Traffic enters the LB",
        text: "Clients generate steady traffic. Requests queue at the load balancer before routing.",
        highlightNodeIds: ["client-1", "lb-1"],
        highlightEdgeIds: ["edge-client-lb-1"],
        stats: {
          clients: { currentRequests: 18, totalRequests: 30 },
          lbs: { "lb-1": { queueDepth: 6 } },
        },
      },
      {
        id: "rr-step-2",
        title: "Round robin routing",
        text: "RR sends requests in strict order, so each server gets the same share.",
        highlightEdgeIds: [
          "edge-lb-1-srv-1",
          "edge-lb-1-srv-2",
          "edge-lb-1-srv-3",
        ],
        stats: {
          lbs: { "lb-1": { queueDepth: 0 } },
          servers: {
            "srv-1": { active: 6, processed: 10 },
            "srv-2": { active: 6, processed: 10 },
            "srv-3": { active: 6, processed: 10 },
          },
        },
      },
      {
        id: "rr-step-3",
        title: "Balanced utilization",
        text: "Latency remains stable because queues stay flat and utilization is even.",
        highlightNodeIds: ["srv-1", "srv-2", "srv-3"],
        stats: {
          clients: { currentRequests: 6, totalRequests: 60 },
          servers: {
            "srv-1": { active: 3, processed: 20 },
            "srv-2": { active: 3, processed: 20 },
            "srv-3": { active: 3, processed: 20 },
          },
        },
      },
    ],
  },
  {
    id: "rr-slow-server",
    algorithm: "Round Robin",
    name: "Slow server breaks RR",
    summary: "RR keeps sending traffic to a slow server, causing queue buildup.",
    setup: [
      "Server 2 is slower",
      "Steady 30 RPS",
      "Same concurrency limits",
    ],
    teaches: [
      "RR ignores performance",
      "Slow nodes hurt tail latency",
    ],
    base: {
      clients: {
        id: "client-1",
        name: "Clients",
        currentRequests: 0,
        totalRequests: 0,
      },
      loadBalancers: [
        {
          id: "lb-1",
          name: "LB Alpha",
          isLeader: true,
          queueDepth: 0,
          drops: 0,
        },
      ],
      servers: [
        {
          id: "srv-1",
          name: "Server 1",
          status: "UP",
          active: 0,
          processed: 0,
          failed: 0,
        },
        {
          id: "srv-2",
          name: "Server 2",
          status: "SLOW",
          active: 0,
          processed: 0,
          failed: 0,
        },
        {
          id: "srv-3",
          name: "Server 3",
          status: "UP",
          active: 0,
          processed: 0,
          failed: 0,
        },
      ],
    },
    steps: [
      {
        id: "rr-slow-1",
        title: "Equal routing continues",
        text: "RR keeps sending equal traffic to all servers, even the slow one.",
        highlightEdgeIds: [
          "edge-lb-1-srv-1",
          "edge-lb-1-srv-2",
          "edge-lb-1-srv-3",
        ],
        stats: {
          clients: { currentRequests: 22, totalRequests: 30 },
        },
      },
      {
        id: "rr-slow-2",
        title: "Queue builds on slow server",
        text: "Server 2 cannot drain as fast, so its backlog grows while others stay clear.",
        highlightNodeIds: ["srv-2"],
        stats: {
          servers: {
            "srv-1": { active: 3, processed: 10 },
            "srv-2": { active: 10, processed: 4 },
            "srv-3": { active: 3, processed: 10 },
          },
        },
      },
      {
        id: "rr-slow-3",
        title: "Tail latency spikes",
        text: "The slow queue dominates completion time, pushing tail latency higher.",
        highlightNodeIds: ["srv-2"],
        stats: {
          clients: { currentRequests: 30, totalRequests: 60 },
          servers: {
            "srv-1": { active: 2, processed: 18 },
            "srv-2": { active: 10, processed: 6 },
            "srv-3": { active: 2, processed: 18 },
          },
        },
      },
    ],
  },
  {
    id: "wrr-weighted",
    algorithm: "Weighted Round Robin",
    name: "Weighted RR favors capacity",
    summary: "Higher weight servers receive more traffic.",
    setup: [
      "Server 1 has higher capacity",
      "Weights: 2, 1, 1",
      "Steady 30 RPS",
    ],
    teaches: [
      "Weights map to capacity",
      "Still no latency awareness",
    ],
    base: {
      clients: {
        id: "client-1",
        name: "Clients",
        currentRequests: 0,
        totalRequests: 0,
      },
      loadBalancers: [
        {
          id: "lb-1",
          name: "LB Alpha",
          isLeader: true,
          queueDepth: 0,
          drops: 0,
        },
      ],
      servers: [
        {
          id: "srv-1",
          name: "Server 1",
          status: "UP",
          active: 0,
          processed: 0,
          failed: 0,
        },
        {
          id: "srv-2",
          name: "Server 2",
          status: "UP",
          active: 0,
          processed: 0,
          failed: 0,
        },
        {
          id: "srv-3",
          name: "Server 3",
          status: "UP",
          active: 0,
          processed: 0,
          failed: 0,
        },
      ],
    },
    steps: [
      {
        id: "wrr-1",
        title: "Weighted routing",
        text: "Weighted RR allocates more turns to higher weight servers.",
        highlightNodeIds: ["lb-1"],
        highlightEdgeIds: ["edge-lb-1-srv-1"],
      },
      {
        id: "wrr-2",
        title: "Capacity-aligned traffic",
        text: "Server 1 handles roughly double the requests of others.",
        highlightNodeIds: ["srv-1"],
        stats: {
          clients: { currentRequests: 18, totalRequests: 40 },
          servers: {
            "srv-1": { active: 8, processed: 16 },
            "srv-2": { active: 4, processed: 8 },
            "srv-3": { active: 4, processed: 8 },
          },
        },
      },
    ],
  },
];
