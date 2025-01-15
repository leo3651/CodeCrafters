import { createInterface } from "readline";
import fs from "fs";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});
const shellCommands: { [key: string]: boolean } = {
  echo: true,
  type: true,
  exit: true,
};

function question() {
  rl.question("$ ", (answer: string) => {
    // EXIT command
    if (answer === "exit 0") {
      process.exit(0);
    }

    // ECHO command
    else if (answer.startsWith("echo ")) {
      const textBack = answer.split("echo ")[1];
      rl.write(`${textBack}\n`);
    }

    // TYPE command
    else if (answer.startsWith("type ")) {
      let found = false;
      const command = answer.split("type ")[1];

      // Built in command
      if (shellCommands[command]) {
        rl.write(`${command} is a shell builtin\n`);
      }

      // Check for built in executable
      else {
        if (!process.env.PATH) {
          throw new Error("Path not specified");
        }
        const dirsPaths = process.env.PATH.split(":");

        for (const dirPath of dirsPaths) {
          try {
            fs.readdirSync(dirPath).forEach((fileName) => {
              if (fileName === command) {
                found = true;
                rl.write(`${command} is ${dirPath}/${command}\n`);
                return;
              }
            });
          } catch (err) {}

          if (found) {
            break;
          }
        }

        // Not found after all
        if (!found) {
          rl.write(`${command}: not found\n`);
        }
      }
    }

    // Previous cases don't match -> command not found
    else {
      rl.write(`${answer}: command not found\n`);
    }

    question();
  });
}

question();
