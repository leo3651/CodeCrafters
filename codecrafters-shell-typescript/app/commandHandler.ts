import { Interface } from "readline";
import fs from "fs";
import { execFileSync } from "node:child_process";

const builtinCommands: { [key: string]: boolean } = {
  exit: true,
  echo: true,
  type: true,
  pwd: true,
  cd: true,
};

export const commandHandler: {
  [key: string]: (
    rl: Interface,
    answer: string,
    writeToTerminal: boolean,
    returnError: boolean
  ) => void | string;
} = {
  exit: (_: Interface, __: string): void => {
    process.exit(0);
  },

  echo: (
    rl: Interface,
    answer: string,
    writeToTerminal: boolean,
    returnError: boolean
  ): string => {
    let textBack = answer.split("echo ")[1];
    textBack = handleEchoCommand(textBack);

    if (writeToTerminal) {
      rl.write(`${textBack}\n`);
    }

    if (returnError) {
      return "";
    }

    return `${textBack}\n`;
  },

  cat: (
    rl: Interface,
    answer: string,
    writeToTerminal: boolean,
    returnError: boolean
  ): string => {
    const filesString = answer.split("cat ")[1];
    let filesArr: string[] = [];
    let error = "";

    if (answer.includes("'") || answer.includes('"')) {
      filesArr = filesString
        .split(filesString[0])
        .filter((word) => word.trim() !== "");
    } else {
      filesArr = filesString.split(" ").filter((word) => word.trim() !== "");
    }

    const content = filesArr.map((file) => {
      try {
        return fs.readFileSync(file).toString("utf-8");
      } catch (err) {
        if (!returnError) {
          rl.write(`cat: ${file}: No such file or directory\n`);
        }
        error += `cat: ${file}: No such file or directory\n`;
      }
    });

    if (writeToTerminal) {
      rl.write(`${content.join("")}`);
    }

    if (returnError) {
      return error;
    }

    return content.join("");
  },

  type: (rl: Interface, answer: string, writeToTerminal: boolean): string => {
    const command = answer.split("type ")[1];
    let output = "";

    // Built in command
    if (builtinCommands[command]) {
      output = `${command} is a shell builtin\n`;
      if (writeToTerminal) {
        rl.write(output);
      }
    }

    // Check for built in executable
    else {
      const exeFile = checkForExeFile(command);

      if (exeFile.length) {
        output = `${command} is ${exeFile[0]}/${exeFile[1]}\n`;
        if (writeToTerminal) {
          rl.write(output);
        }
      }

      // Not found after all
      if (!exeFile.length) {
        output = `${command}: not found\n`;
        if (writeToTerminal) {
          rl.write(output);
        }
      }
    }

    return output;
  },

  pwd: (rl: Interface, _: string, writeToTerminal: boolean): string => {
    const output = `${process.cwd()}\n`;
    if (writeToTerminal) {
      rl.write(output);
    }
    return output;
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

function checkForExeFile(command: string): string[] {
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

export function executeProgramIfPossible(answer: string): Buffer | null {
  let command = "";
  let args: string[] = [];

  if (answer.includes('"') || answer.includes("'")) {
    [command, ...args] = answer.split(`${answer[0]} `);
    command = command.slice(1);
  } else {
    [command, ...args] = answer.split(" ");
  }

  const exeFile = checkForExeFile(command);
  let buf: Buffer;

  if (exeFile.length) {
    try {
      buf = Buffer.from(
        execFileSync(command, args, {
          stdio: ["pipe", "pipe", "pipe"], // capture all I/O so nothing prints automatically
          encoding: "utf8",
        })
      );
    } catch (err: any) {
      buf = Buffer.from(err.message);
    }
    return buf;
  }

  return null;
}

export function handleEchoCommand(str: string): string {
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

    // Handle unquoted strings
    else {
      const outsideQuotesStr: string[] = [];

      while (true) {
        if (i > str.length - 1) {
          break;
        }

        // Handle backslash
        else if (str[i] === "\\") {
          outsideQuotesStr.push(str[i + 1]);
          i++;
        }

        // Handle space
        else if (str[i] === " ") {
          outsideQuotesStr.push(str[i]);
          break;
        }

        // Handle quotes
        else if (str[i] === "'" || str[i] === '"') {
          i--;
          break;
        }

        // Building the word
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

export function isRedirectCommand(answer: string, rl: Interface): boolean {
  if (
    answer.includes(" > ") ||
    answer.includes(" 1> ") ||
    answer.includes(" 2> ") ||
    answer.includes(" 1>> ") ||
    answer.includes(" >> ")
  ) {
    const [command, file] = answer.split(
      answer.includes(" 1> ")
        ? " 1> "
        : answer.includes(" 2> ")
        ? " 2> "
        : answer.includes(" >> ")
        ? " >> "
        : answer.includes(" > ")
        ? " > "
        : " 1>> "
    );
    const commandName = command.split(" ")[0];

    if (Object.keys(commandHandler).includes(commandName)) {
      const content = commandHandler[commandName](
        rl,
        command,
        answer.includes(" 2> ") ? true : false,
        answer.includes(" 2> ") ? true : false
      );
      if (content !== null && content !== undefined) {
        fs.writeFileSync(file, content, {
          flag: answer.includes(" 1>> ") || answer.includes(" >> ") ? "a" : "w",
        });
      }
    } else {
      const buf = executeProgramIfPossible(command);
      if (buf) {
        fs.writeFileSync(file, buf.toString("utf-8"), {
          flag: answer.includes(" 1>> ") || answer.includes(" >> ") ? "a" : "w",
        });
      }
    }

    return true;
  }
  return false;
}
