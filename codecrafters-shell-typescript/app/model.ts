import { ChildProcess } from "child_process";

export type CommandOutput = { stdout: string[]; stderr: string[] };

export type Completion = {
  name: string;
  type: CompletionType;
};

export enum CompletionType {
  File,
  Directory,
}

export interface ChildProcessWithStatus extends ChildProcess {
  isDone: boolean;
  command: string;
  jobNumber: number;
}
