import { createInterface, Interface } from "readline";
import { CommandOutput, Commands, History } from "./commands";
import { Redirect } from "./redirect";
import { getExecutables, getLongestCommonPrefix } from "./helpers";
import { Pipeline } from "./pipeline";

let tabPressedPreviously: boolean = false;
const rl: Interface = createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: autocomplete,
  historySize: 0,
});

// MAIN
History.load();
const executablesPromise: Promise<string[]> = getExecutables();
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

    prompt();
  });
}

async function autocomplete(
  line: string,
  cb: (err: any, result: [string[], string]) => void
): Promise<void> {
  const executables: string[] = await executablesPromise;
  const allCommands: string[] = [...Commands.available, ...executables];
  const completions: string[] = [...new Set(allCommands)].filter((cmd) =>
    cmd.startsWith(line)
  );

  // Ring a bell
  if (completions.length === 0) {
    process.stdout.write("\x07");
    cb(null, [[], line]);
  }

  // Autocomplete line
  else if (completions.length === 1) {
    cb(null, [[`${completions[0]} `], line]);
  }

  // Multiple completions
  else if (completions.length > 0) {
    // Print all possibilities
    if (tabPressedPreviously) {
      process.stdout.write(`\n${completions.sort().join("  ")}\n$ ${line}`);
      cb(null, [[], line]);
    }

    // Ring a bell or autocomplete common prefix
    else {
      const longestCommonPrefix: string = getLongestCommonPrefix(completions);
      if (longestCommonPrefix) {
        cb(null, [[longestCommonPrefix], line]);
      } else {
        process.stdout.write("\x07");
        cb(null, [[], line]);
      }
    }
  }

  tabPressedPreviously = true;
}

process.stdin.on("keypress", (_, key) => {
  if (key.name !== "tab") {
    tabPressedPreviously = false;
  }

  if (key.name === "up") {
    rl.write(null, { ctrl: true, name: "u" });
    rl.write(`${History.getPrevious()}`);
  }

  if (key.name === "down") {
    rl.write(null, { ctrl: true, name: "u" });
    rl.write(`${History.getNext()}`);
  }
});
