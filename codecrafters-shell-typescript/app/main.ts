import { createInterface, Interface } from "readline";
import { Commands, History } from "./commands";
import { Redirect } from "./redirect";
import { Pipeline } from "./pipeline";
import { CommandOutput } from "./model";
import { completer, autocompleteFromHistory } from "./autocomplete";
import { Jobs } from "./jobs";

const rl: Interface = createInterface({
  input: process.stdin,
  output: process.stdout,
  completer,
  historySize: 0,
});

// MAIN
History.load();
prompt();

// Definitions
function prompt(): void {
  rl.question("$ ", async (line: string) => {
    History.add(line);

    // Pipe
    if (line.includes(" | ")) {
      await Pipeline.exe(line);
    }

    // Redirect
    else if (Redirect.isRedirectCommand(line)) {
      const output: string = Redirect.handleRedirectCommand(line);
      if (output) {
        rl.write(output);
      }
    }

    // Command
    else {
      try {
        const { stderr, stdout }: CommandOutput = Commands.execute(line);
        const output: string = stdout.join("") || stderr.join("");

        if (output) {
          rl.write(output);
        }
      } catch (err) {
        rl.write(`${line}: command not found\n`);
      }
    }

    Jobs.showOnlyDoneJobs();
    prompt();
  });
}

process.stdin.on("keypress", (_, key) => {
  autocompleteFromHistory(rl, key);
});
