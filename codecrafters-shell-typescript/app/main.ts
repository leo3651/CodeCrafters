import { createInterface } from "readline";
import {
  commandHandler,
  executeProgramIfPossible,
  handleRedirectCommand,
  isRedirectCommand,
} from "./commandHandler";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

question();

function question(): void {
  rl.question("$ ", (answer: string) => {
    const command = answer.split(" ")[0];

    // Redirect command
    if (isRedirectCommand(answer)) {
      handleRedirectCommand(answer, rl);
    }

    // Built in command
    else if (Object.keys(commandHandler).includes(command)) {
      commandHandler[command](rl, answer, true, false);
    }

    // Command not found || execute program
    else {
      const buffer = executeProgramIfPossible(answer, true, rl);

      if (buffer) {
        rl.write(buffer.toString("utf-8"));
      } else {
        rl.write(`${answer}: command not found\n`);
      }
    }

    question();
  });
}
