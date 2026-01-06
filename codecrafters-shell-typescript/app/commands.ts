import path from "path";
import fs from "fs";
import { spawnSync, SpawnSyncReturns } from "child_process";
import { QuotesHandler } from "./helpers";

export type CommandOutput = { stdout: string[]; stderr: string[] };

export class Commands {
  public static readonly available: string[] = [
    "exit",
    "echo",
    "type",
    "pwd",
    "cd",
  ];

  public static execute(line: string): CommandOutput {
    const command: string = line.split(" ")[0];

    if (Commands.available.includes(command)) {
      return Commands.executeBuiltIn(line);
    } else {
      return ExternalCommand.exeExternalProgram(line);
    }
  }

  private static executeBuiltIn(line: string): CommandOutput {
    const command: string = line.split(" ")[0];

    switch (command) {
      case "exit":
        Exit.exe(Exit.prepare(line));
        return { stdout: [], stderr: [] };

      case "echo":
        return Echo.exe(line.slice(5));

      case "type":
        return Type.exe(line.slice(5));

      case "pwd":
        return Pwd.exe();

      case "cd":
        return Cd.exe(line);

      default:
        throw new Error("Unknown built in command");
    }
  }
}

class Exit {
  public static prepare(line: string): number {
    const [_, number]: string[] = line.split(" ");
    return Number.parseInt(number);
  }

  public static exe(number: number): void {
    process.exit(0);
  }
}

class Echo {
  public static exe(echo: string): CommandOutput {
    return {
      stdout: [`${QuotesHandler.handleQuotes(echo).finalString}\n`],
      stderr: [],
    };
  }
}

class Type {
  public static exe(command: string): CommandOutput {
    if (Commands.available.includes(command)) {
      return { stdout: [`${command} is a shell builtin\n`], stderr: [] };
    } else {
      const exeFilePath: string = ExternalCommand.checkForExeFile(command);

      if (exeFilePath) {
        return { stdout: [`${command} is ${exeFilePath}\n`], stderr: [] };
      } else {
        return { stdout: [], stderr: [`${command}: not found\n`] };
      }
    }
  }
}

class Pwd {
  public static exe(): CommandOutput {
    return { stdout: [`${process.cwd()}\n`], stderr: [] };
  }
}

class Cd {
  public static exe(line: string): CommandOutput {
    let output: string = "";

    const path: string = line.split(" ")[1];

    if (path === "~" && process.env.HOME) {
      process.chdir(process.env.HOME);
    } else {
      try {
        process.chdir(path);
      } catch (err: any) {
        output = `cd: ${path}: ${err.message}\n`;
      }
    }

    return { stdout: [], stderr: [output] };
  }
}

export class ExternalCommand {
  public static checkForExeFile(command: string): string {
    let exeFilePath: string = "";
    const pathsEnv: string = process.env.PATH ?? "";

    const directories: string[] = pathsEnv.split(path.delimiter);

    directories.find((dir) => {
      const pathToCheck: string = path.join(dir, command);

      if (!fs.existsSync(pathToCheck)) {
        return false;
      }

      try {
        const st: fs.Stats = fs.statSync(pathToCheck);

        if ((st.mode & 0o111) !== 0) {
          exeFilePath = pathToCheck;
          return true;
        }

        return false;
      } catch {
        return false;
      }
    });

    return exeFilePath;
  }

  public static exeExternalProgram(line: string): CommandOutput {
    let command: string = "";
    let args: string[] = [];

    if (line.includes('"') || line.includes("'")) {
      [command, ...args] = QuotesHandler.handleQuotes(line).filePaths;
    } else {
      [command, ...args] = line.split(" ");
    }

    let stdout: string[] = [];
    let stderr: string[] = [];

    const exeFilePath: string = this.checkForExeFile(command);

    if (exeFilePath) {
      const result: SpawnSyncReturns<Buffer<ArrayBufferLike>> = spawnSync(
        command,
        args
      );
      stdout = [result.stdout.toString()];
      stderr = [result.stderr.toString()];
    } else {
      throw new Error("Invalid command");
    }

    return { stdout, stderr };
  }
}
