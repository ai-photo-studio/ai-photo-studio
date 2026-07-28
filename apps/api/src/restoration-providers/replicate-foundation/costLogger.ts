import type { ReplicateCostRecord } from "./types";

export interface ReplicateCostLogger {
  log(record: ReplicateCostRecord): Promise<void>;
}

export class NoopReplicateCostLogger implements ReplicateCostLogger {
  async log(): Promise<void> {
    return;
  }
}

