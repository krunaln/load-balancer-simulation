import type { AlgorithmId, ServerState } from "./types";

type SelectResult = {
  serverId?: string;
  reason: string;
  rrIndex?: number;
};

export type Algorithm = {
  id: AlgorithmId;
  name: string;
  description: string;
  select: (args: {
    servers: ServerState[];
    availableIds: string[];
    rrIndex: number;
    requestId: number;
  }) => SelectResult;
};

const withAvailableServers = (servers: ServerState[], availableIds: string[]) =>
  servers.filter((server) => availableIds.includes(server.id));

const pickDeterministicPair = (length: number, requestId: number) => {
  if (length <= 1) return [0, 0];
  const first = requestId % length;
  const second = (first + 1 + (requestId * 7) % (length - 1)) % length;
  return [first, second];
};

export const algorithms: Algorithm[] = [
  {
    id: "round-robin",
    name: "Round Robin",
    description: "Cycles through available servers in order.",
    select: ({ availableIds, rrIndex }) => {
      if (availableIds.length === 0) {
        return { reason: "no available servers" };
      }
      const index = rrIndex % availableIds.length;
      const serverId = availableIds[index];
      return {
        serverId,
        rrIndex: rrIndex + 1,
        reason: `round robin index ${rrIndex} -> ${serverId}`,
      };
    },
  },
  {
    id: "least-connections",
    name: "Least Connections",
    description: "Chooses the server with the fewest active requests.",
    select: ({ servers, availableIds }) => {
      const candidates = withAvailableServers(servers, availableIds);
      if (!candidates.length) {
        return { reason: "no available servers" };
      }
      let chosen = candidates[0];
      for (const server of candidates) {
        if (server.inflight.length < chosen.inflight.length) {
          chosen = server;
        }
      }
      return {
        serverId: chosen.id,
        reason: `least connections picked ${chosen.id} (${chosen.inflight.length} active)`,
      };
    },
  },
  {
    id: "weighted-round-robin",
    name: "Weighted Round Robin",
    description: "Rounds through servers with weight bias.",
    select: ({ servers, availableIds, rrIndex }) => {
      const candidates = withAvailableServers(servers, availableIds);
      if (!candidates.length) {
        return { reason: "no available servers" };
      }
      const totalWeight = candidates.reduce(
        (sum, server) => sum + Math.max(1, server.weight),
        0
      );
      const slot = rrIndex % totalWeight;
      let cursor = 0;
      let chosen = candidates[0];
      for (const server of candidates) {
        cursor += Math.max(1, server.weight);
        if (slot < cursor) {
          chosen = server;
          break;
        }
      }
      return {
        serverId: chosen.id,
        rrIndex: rrIndex + 1,
        reason: `weighted round robin -> ${chosen.id} (slot ${slot}/${totalWeight})`,
      };
    },
  },
  {
    id: "ewma",
    name: "EWMA Latency",
    description: "Chooses the lowest EWMA latency server.",
    select: ({ servers, availableIds }) => {
      const candidates = withAvailableServers(servers, availableIds);
      if (!candidates.length) {
        return { reason: "no available servers" };
      }
      let chosen = candidates[0];
      for (const server of candidates) {
        if (server.ewmaLatencyMs < chosen.ewmaLatencyMs) {
          chosen = server;
        }
      }
      return {
        serverId: chosen.id,
        reason: `ewma picked ${chosen.id} (${Math.round(
          chosen.ewmaLatencyMs
        )}ms)`,
      };
    },
  },
  {
    id: "p2c",
    name: "Power of Two Choices",
    description: "Picks two servers deterministically and chooses the less loaded.",
    select: ({ servers, availableIds, requestId }) => {
      const candidates = withAvailableServers(servers, availableIds);
      if (!candidates.length) {
        return { reason: "no available servers" };
      }
      const [a, b] = pickDeterministicPair(candidates.length, requestId);
      const first = candidates[a];
      const second = candidates[b] ?? first;
      const firstLoad = first.inflight.length + first.queue.length;
      const secondLoad = second.inflight.length + second.queue.length;
      const chosen = firstLoad <= secondLoad ? first : second;
      return {
        serverId: chosen.id,
        reason: `p2c chose ${chosen.id} (${firstLoad} vs ${secondLoad})`,
      };
    },
  },
];

export const getAlgorithm = (id: AlgorithmId) =>
  algorithms.find((algo) => algo.id === id) ?? algorithms[0];
