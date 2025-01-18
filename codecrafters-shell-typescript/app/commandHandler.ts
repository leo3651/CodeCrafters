import { Interface } from "readline";
import fs from "fs";

export const commandHandler: {
  [key: string]: (rl: Interface, answer: string) => void;
} = {
  exit: (_: Interface, __: string): void => {
    process.exit(0);
  },

  echo: (rl: Interface, answer: string): void => {
    const textBack = answer.split("echo ")[1];
    rl.write(`${textBack}\n`);
  },

  type: (rl: Interface, answer: string): void => {
    const command = answer.split("type ")[1];

    // Built in command
    if (Object.keys(commandHandler).includes(command)) {
      rl.write(`${command} is a shell builtin\n`);
    }

    // Check for built in executable
    else {
      const exeFile = checkForExeFile(command);

      if (exeFile.length) {
        rl.write(`${command} is ${exeFile[0]}/${exeFile[1]}\n`);
      }

      // Not found after all
      if (!exeFile.length) {
        rl.write(`${command}: not found\n`);
      }
    }
  },

  pwd(rl: Interface, answer: string) {
    rl.write(`${process.cwd()}\n`);
  },

  cd(rl: Interface, answer: string) {
    const path = answer.split(" ")[1];
    if (path === "~" && process.env.HOME) {
      process.chdir(process.env.HOME);
    } else {
      try {
        process.chdir(path);
      } catch (err: any) {
        rl.write(`cd: ${path}: ${err.message}\n`);
      }
    }
  },
};

export function checkForExeFile(command: string): string[] {
  const exeFile: string[] = [];

  if (!process.env.PATH) {
    throw new Error("Path not specified");
  }

  let found = false;
  const dirsPaths = process.env.PATH.split(":");

  for (const dirPath of dirsPaths) {
    try {
      fs.readdirSync(dirPath).forEach((fileName) => {
        if (fileName === command) {
          found = true;
          exeFile.push(dirPath);
          exeFile.push(command);
          return;
        }
      });
    } catch (err) {}

    if (found) {
      break;
    }
  }

  return exeFile;
}
