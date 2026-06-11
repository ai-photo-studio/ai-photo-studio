type WorkerHealthState = {
  running: boolean;
  startedAt: string | null;
  lastCompletedAt: string | null;
  lastFailedAt: string | null;
  lastError: string | null;
  processedCount: number;
};

const initialState: WorkerHealthState = {
  running: false,
  startedAt: null,
  lastCompletedAt: null,
  lastFailedAt: null,
  lastError: null,
  processedCount: 0
};

let workerHealthState: WorkerHealthState = { ...initialState };

export const setWorkerHealthState = (patch: Partial<WorkerHealthState>) => {
  workerHealthState = {
    ...workerHealthState,
    ...patch
  };
};

export const recordWorkerStarted = () => {
  workerHealthState = {
    ...initialState,
    running: true,
    startedAt: new Date().toISOString()
  };
};

export const recordWorkerCompleted = () => {
  setWorkerHealthState({
    lastCompletedAt: new Date().toISOString(),
    processedCount: workerHealthState.processedCount + 1
  });
};

export const recordWorkerFailure = (error: string) => {
  setWorkerHealthState({
    lastFailedAt: new Date().toISOString(),
    lastError: error
  });
};

export const getWorkerHealthState = (): WorkerHealthState => workerHealthState;
