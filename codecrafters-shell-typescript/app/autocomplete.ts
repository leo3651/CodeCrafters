import { Interface } from "readline";
import { Commands, History } from "./commands";
import { getExecutables, getLongestCommonPrefix } from "./helpers";

let tabPressedPreviously: boolean = false;
const executablesPromise: Promise<string[]> = getExecutables();

export async function autocomplete(
  line: string,
  cb: (err: any, result: [string[], string]) => void,
): Promise<void> {
  const executables: string[] = await executablesPromise;
  const allCommands: string[] = [...Commands.available, ...executables];
  const completions: string[] = [...new Set(allCommands)].filter((cmd) =>
    cmd.startsWith(line),
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

export function autocompleteFromHistory(rl: Interface, key: any) {
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
}
