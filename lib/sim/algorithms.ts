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
  }) => SelectResult;
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
    description: "Selects the server with the fewest active connections.",
    select: ({ servers, availableIds }) => {
      if (availableIds.length === 0) {
        return { reason: "no available servers" };
      }
      const candidates = servers.filter((server) =>
        availableIds.includes(server.id)
      );
      let chosen = candidates[0];
      for (const server of candidates) {
        if (server.inflight.length < chosen.inflight.length) {
          chosen = server;
        }
      }
      const connections = chosen.inflight.length;
      return {
        serverId: chosen.id,
        reason: `least connections picked ${chosen.id} (${connections} active)`,
      };
    },
  },
];

export const getAlgorithm = (id: AlgorithmId) =>
  algorithms.find((algo) => algo.id === id) ?? algorithms[0];
