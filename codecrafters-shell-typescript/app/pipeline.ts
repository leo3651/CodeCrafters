import {
  ChildProcess,
  ChildProcessWithoutNullStreams,
  spawn,
} from "child_process";
import { PassThrough } from "stream";
import { CommandOutput, Commands, ExternalCommand } from "./commands";

export class Pipeline {
  public static async exe(line: string): Promise<void> {
    return new Promise((resolve) => {
      const commands: string[] = line.split(" | ");

      let upstream: NodeJS.ReadableStream | null = null;
      let lastChild: ChildProcess | null = null;

      for (let i = 0; i < commands.length; i++) {
        const downStream: PassThrough = new PassThrough();

        const [command, ...args]: string[] = commands[i].split(" ");

        if (Commands.available.includes(command)) {
          if (upstream) {
            upstream.resume();
          }
          const { stdout }: CommandOutput = Commands.execute(commands[i]);
          downStream.write(stdout.join(""));
          downStream.end();
        } else {
          const exeFilePath: string = ExternalCommand.checkForExeFile(command);

          if (!exeFilePath) {
            throw new Error("Invalid command");
          }

          const child: ChildProcessWithoutNullStreams = spawn(
            exeFilePath,
            args
          );
          lastChild = child;

          if (upstream) {
            upstream.pipe(child.stdin);
          }
          child.stdout.pipe(downStream);
        }

        upstream = downStream;
      }

      if (upstream) {
        upstream.pipe(process.stdout);

        if (lastChild) {
          lastChild.on("exit", resolve);
        } else {
          upstream.on("end", resolve);
        }
      }
    });
  }
}
