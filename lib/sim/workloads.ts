import type { WorkloadId } from "./types";

export type Workload = {
  id: WorkloadId;
  name: string;
  description: string;
  rateRps: (timeMs: number) => number;
};

export const workloads: Workload[] = [
  {
    id: "steady",
    name: "Steady",
    description: "Constant baseline traffic.",
    rateRps: () => 20,
  },
  {
    id: "burst",
    name: "Burst",
    description: "Periodic traffic spikes on top of a baseline.",
    rateRps: (timeMs) => {
      const base = 8;
      const burst = 45;
      const cycleMs = 8000;
      const burstMs = 2000;
      const withinBurst = timeMs % cycleMs < burstMs;
      return withinBurst ? base + burst : base;
    },
  },
];

export const getWorkload = (id: WorkloadId) =>
  workloads.find((workload) => workload.id === id) ?? workloads[0];
