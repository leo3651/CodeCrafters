import { createInterface } from "readline";
import {
  commandHandler,
  executeProgramIfPossible,
  handleRedirectCommand,
  isRedirectCommand,
} from "./commandHandler";
import fs from "fs";

const AUDIO_CODE = "\u0007";
const CLEAR_CURRENT_LINE = { ctrl: true, name: "u" };
let previousPrompt = "";

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

process.stdin.on("keypress", (_, key) => {
  // On TAB
  if (key.sequence === "\t") {
    const completions = ["echo", "exit"];
    const line = rl.line.replaceAll("\t", "");

    // Add environment commands hits
    const envPaths = process.env.PATH?.split(":");
    const eligiblePaths: string[] =
      envPaths
        ?.flatMap((path) => {
          try {
            return fs
              .readdirSync(path)
              .filter((fileName) => fileName.startsWith(line));
          } catch (err) {
            return [];
          }
        })
        .filter((file) => file !== undefined && file !== null) || [];

    // Add builtin commands hits
    const builtinHits = completions.filter((c) => c.startsWith(line));

    const hits = [...new Set([...builtinHits, ...eligiblePaths])];

    // Only one hit found
    if (hits.length === 1) {
      rl.write(null, CLEAR_CURRENT_LINE);
      rl.write(hits[0] + " ");
    }

    // Multiple hits found
    else if (hits.length > 1) {
      // Only environmental commands found
      if (!builtinHits.length && eligiblePaths.length) {
        // All hits have same prefixes
        if (allPathsWithSamePrefixes(hits, line)) {
          hits.sort();
          rl.write(null, CLEAR_CURRENT_LINE);
          rl.write(hits[0]);
        }

        // Hits DON'T have same prefixes
        else {
          // First ring the bell then on second TAB write all commands to the terminal
          if (previousPrompt !== line) {
            previousPrompt = line;
            process.stdout.write("\r$ " + rl.line.trim() + AUDIO_CODE);
          } else {
            process.stdout.write(`\n${hits.sort().join("  ")}\n`);
            process.stdout.write("\r$ " + line);
          }
        }
      }

      // Environmental commands and builtin commands found. Write all to the terminal
      else {
        process.stdout.write(`\n${hits.sort().join("  ")}\n`);
        process.stdout.write("\r$ " + line);
      }
    }

    // No hit found
    else {
      // Ring the bell
      process.stdout.write("\r$ " + rl.line.trim() + AUDIO_CODE);
    }
  }

  if (key.ctrl && key.name === "c") {
    console.log("Exiting...");
    process.exit();
  }
});

function allPathsWithSamePrefixes(hits: string[], line: string): boolean {
  if (hits.every((hit) => hit.includes(line))) {
    const shallowCopyHits = [...hits];
    shallowCopyHits.sort();

    for (let i = 0; i < shallowCopyHits.length; i++) {
      if (
        !shallowCopyHits[shallowCopyHits.length - 1].includes(
          shallowCopyHits[i]
        )
      ) {
        return false;
      }
    }
    return true;
  }

  return false;
}
