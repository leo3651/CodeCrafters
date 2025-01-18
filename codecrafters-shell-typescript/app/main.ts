import { createInterface } from "readline";
import { execFileSync } from "node:child_process";
import { checkForExeFile, commandHandler } from "./commandHandler";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

question();

function question() {
  rl.question("$ ", (answer: string) => {
    const command = answer.split(" ")[0];

    if (Object.keys(commandHandler).includes(command)) {
      commandHandler[command](rl, answer);
    }

    // Command not found || execute program
    else {
      const fileExecuted = executeProgramIfPossible(answer);
      if (!fileExecuted) {
        rl.write(`${answer}: command not found\n`);
      }
    }

    question();
  });
}

function executeProgramIfPossible(answer: string): boolean {
  const [command, ...args] = answer.split(" ");
  const exeFile = checkForExeFile(command);
  if (exeFile.length) {
    const buf = execFileSync(command, args);
    rl.write(buf.toString("utf-8"));
    return true;
  }
  return false;
}
