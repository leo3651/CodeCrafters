import { Interface } from "readline";
import { Commands, History } from "./commands";
import { getExecutables, getLongestCommonPrefix } from "./helpers";
import fs from "fs";
import { Completion, CompletionType } from "./model";

let tabPressedPreviously: boolean = false;
const executablesPromise: Promise<string[]> = getExecutables();

export async function completer(
  line: string,
  cb: (err: any, result: [string[], string]) => void,
): Promise<void> {
  if (line.split(" ").length > 1) {
    await autoCompleteFileAndDir(line, cb);
  } else {
    await autocompleteCommand(line, cb);
  }

  tabPressedPreviously = true;
}

export function autocompleteFromHistory(rl: Interface, key: any): void {
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

async function autocompleteCommand(
  line: string,
  cb: (err: any, result: [string[], string]) => void,
): Promise<void> {
  const executables: string[] = await executablesPromise;
  const allCommands: string[] = [...Commands.available, ...executables];
  const completions: Completion[] = [...new Set(allCommands)]
    .filter((cmd: string) => cmd.startsWith(line))
    .map((exe: string) => ({ type: CompletionType.File, name: exe }));

  await autoComplete(completions, line, cb);
}

async function autoCompleteFileAndDir(
  line: string,
  cb: (err: any, result: [string[], string]) => void,
): Promise<void> {
  const completions: Completion[] = [];

  const partToComplete: string = line.slice(line.lastIndexOf(" ") + 1);
  const dirPath: string =
    partToComplete.lastIndexOf("/") > -1
      ? partToComplete.slice(0, partToComplete.lastIndexOf("/"))
      : ".";

  fs.readdirSync(dirPath, { withFileTypes: true }).forEach(
    (file: fs.Dirent) => {
      const fullPath: string = `${dirPath}/${file.name}`;

      if (fullPath.includes(partToComplete)) {
        completions.push({
          name: `${file.name}`,
          type: file.isFile() ? CompletionType.File : CompletionType.Directory,
        });
      }
    },
  );

  await autoComplete(completions, line, cb);
}

async function autoComplete(
  completions: Completion[],
  line: string,
  cb: (err: any, result: [string[], string]) => void,
): Promise<void> {
  // Ring a bell
  if (completions.length === 0) {
    process.stdout.write("\x07");
    cb(null, [[], line]);
  }

  // Autocomplete line
  else if (completions.length === 1) {
    cb(null, [
      [
        `${completions[0].name}${completions[0].type === CompletionType.File ? " " : "/"}`,
      ],
      substringToComplete(line),
    ]);
  }

  // Multiple completions
  else if (completions.length > 0) {
    // Print all possibilities
    if (tabPressedPreviously) {
      process.stdout.write(
        `\n${completions
          .map(
            (completion) =>
              `${completion.name}${completion.type === CompletionType.Directory ? "/" : ""}`,
          )
          .sort()
          .join("  ")}\n$ ${line}`,
      );
      cb(null, [[], line]);
    }

    // Ring a bell or autocomplete common prefix
    else {
      const longestCommonPrefix: string = getLongestCommonPrefix(completions);
      if (longestCommonPrefix) {
        cb(null, [[longestCommonPrefix], substringToComplete(line)]);
      } else {
        process.stdout.write("\x07");
        cb(null, [[], line]);
      }
    }
  }
}

function substringToComplete(line: string): string {
  if (line.endsWith("/")) {
    return "";
  } else if (line.includes("/")) {
    return line.split("/").at(-1)!;
  } else if (line.includes(" ")) {
    return line.split(" ").at(-1)!;
  } else {
    return line;
  }
}
