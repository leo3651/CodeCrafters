import { ChildProcess, spawn } from "child_process";
import { ChildProcessWithStatus, CommandOutput } from "./model";

export class Jobs {
  private static jobs: ChildProcessWithStatus[] = [];
  private static recycleJobNumbers: number[] = [];

  public static runInBackground(line: string): CommandOutput {
    const [command, ...args] = line.slice(0, -2).split(" ");

    const childProcess: ChildProcessWithStatus = Object.assign(
      spawn(command, args, { stdio: "inherit" }),
      {
        isDone: false,
        command: line.slice(0, -2),
        jobNumber: this.getNextJobNumber(),
      },
    );
    childProcess.on("exit", () => {
      childProcess.isDone = true;
    });

    this.jobs.push(childProcess);
    process.stdout.write(`[${this.jobs.length}] ${childProcess.pid}\n`);

    return { stdout: [], stderr: [] };
  }

  public static exe(): CommandOutput {
    const finalOutput: string = this.listJobs().join("");
    this.removeDoneJobs();

    return { stdout: [finalOutput], stderr: [] };
  }

  public static showOnlyDoneJobs(): void {
    const finalOutput: string = this.listJobs()
      .filter((line) => line.includes("Done"))
      .join("");
    this.removeDoneJobs();

    process.stdout.write(finalOutput);
  }

  private static listJobs(): string[] {
    return this.jobs.map((job, index) => {
      const status: string = job.isDone ? "Done" : "Running";
      const marker: string =
        index === this.jobs.length - 1
          ? "+"
          : index === this.jobs.length - 2
            ? "-"
            : " ";

      return (
        `[${job.jobNumber}]${marker}  ${status}`.padEnd(24, " ") +
        `${job.command}\n`
      );
    });
  }

  private static removeDoneJobs(): void {
    this.jobs = this.jobs.filter((job) => {
      if (job.isDone) {
        this.recycleJobNumbers.push(job.jobNumber);
      }

      return !job.isDone;
    });
  }

  private static getNextJobNumber(): number {
    if (this.recycleJobNumbers.length > 0) {
      return this.recycleJobNumbers.shift()!;
    }

    return this.jobs.length + 1;
  }
}
