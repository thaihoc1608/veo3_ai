export enum ScenarioStatus {
  Idle = 'Idle',
  Generating = 'Generating',
  Completed = 'Completed',
  Error = 'Error',
}

export interface Scenario {
  id: string;
  prompt: string;
  status: ScenarioStatus;
  videoUrl?: string;
  error?: string;
}