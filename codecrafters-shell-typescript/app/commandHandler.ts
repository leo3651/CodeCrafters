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
    if (commandHandler[command]) {
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
