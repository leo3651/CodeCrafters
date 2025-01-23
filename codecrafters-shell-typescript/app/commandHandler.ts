import { Interface } from "readline";
import fs from "fs";

const builtinCommands: { [key: string]: boolean } = {
  exit: true,
  echo: true,
  type: true,
  pwd: true,
  cd: true,
};

export const commandHandler: {
  [key: string]: (rl: Interface, answer: string) => void;
} = {
  exit: (_: Interface, __: string): void => {
    process.exit(0);
  },

  echo: (rl: Interface, answer: string): void => {
    let textBack = answer.split("echo ")[1];
    textBack = handleEchoCommand(textBack);
    rl.write(`${textBack}\n`);
  },

  cat: (rl: Interface, answer: string): void => {
    const filesString = answer.split("cat ")[1];

    const filesArr = filesString
      .split(filesString[0])
      .filter((word) => word.trim() !== "");

    const content = filesArr.map((file) => {
      try {
        return fs.readFileSync(file).toString("utf-8");
      } catch (err) {
        throw new Error("File does not exist");
      }
    });

    rl.write(`${content.join("")}`);
  },

  type: (rl: Interface, answer: string): void => {
    const command = answer.split("type ")[1];

    // Built in command
    if (builtinCommands[command]) {
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

  pwd: (rl: Interface, answer: string): void => {
    rl.write(`${process.cwd()}\n`);
  },

  cd: (rl: Interface, answer: string): void => {
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

function handleEchoCommand(str: string) {
  let i = 0;
  let finalString: string = "";

  while (i < str.length) {
    // Handle double quotes
    if (
      (str[i] === '"' && i - 1 >= 0 && str[i - 1] !== "\\") ||
      (i === 0 && str[i] === '"')
    ) {
      let insideDoubleQuotesStr: string[] = [];
      i++;

      while (true) {
        if (str[i] === '"' && i - 1 >= 0 && str[i - 1] !== "\\") {
          break;
        }

        if (i === str.length - 1 && str[i] === '"' && str[i - 1] === "\\") {
          break;
        }

        if (str[i] === "\\") {
          insideDoubleQuotesStr.push(str[i + 1]);
          i++;
        } else {
          insideDoubleQuotesStr.push(str[i]);
        }
        i++;
      }

      finalString += insideDoubleQuotesStr.join("");
    }

    // Handle single quotes
    else if (str[i] === "'") {
      i++;
      let start = i;

      while (str[i] !== "'") {
        i++;
      }

      finalString += str.slice(start, i);
    }

    // Handle space char
    else if (str[i] === " ") {
      if (finalString[finalString.length - 1] !== " ") {
        finalString += " ";
      }
    }

    // Handle other letters
    else {
      const outsideQuotesStr: string[] = [];

      while (true) {
        if (i > str.length - 1) {
          break;
        }

        //
        else if (str[i] === "\\") {
          outsideQuotesStr.push(str[i + 1]);
          i++;
        }

        //
        else if (str[i] === " ") {
          outsideQuotesStr.push(str[i]);
          break;
        }

        //
        else if (str[i] === "'" || str[i] === '"') {
          i--;
          break;
        }

        //
        else {
          outsideQuotesStr.push(str[i]);
        }
        i++;
      }

      finalString += outsideQuotesStr.join("");
    }

    i++;
  }

  return finalString;
}
