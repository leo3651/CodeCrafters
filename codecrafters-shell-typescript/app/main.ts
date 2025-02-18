import { createInterface } from "readline";
import {
  commandHandler,
  executeProgramIfPossible,
  handleRedirectCommand,
  isRedirectCommand,
} from "./commandHandler";
import fs from "fs";

const AUDIO_CODE = "\u0007";
const MOVE_TO_LINE_END = { ctrl: true, name: "e" };
const CLEAR_CURRENT_LINE = { ctrl: true, name: "u" };

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
  if (key.sequence === "\t") {
    const completions = ["echo", "exit"];

    const envPaths = process.env.PATH?.split(":");
    const eligiblePaths: string[] =
      envPaths
        ?.flatMap((path) => {
          try {
            return fs
              .readdirSync(path)
              .filter((fileName) =>
                fileName.startsWith(rl.line.replaceAll("\t", ""))
              );
          } catch (err) {
            return [];
          }
        })
        .filter((file) => file !== undefined && file !== null) || [];

    let hits = completions.filter((c) =>
      c.startsWith(rl.line.replaceAll("\t", ""))
    );

    hits = [...new Set([...hits, ...eligiblePaths])];
    // console.log("hits", hits);
    // console.log("line", [rl.line]);

    if (hits.length === 1) {
      // console.log("ONE HIT");
      rl.write(null, CLEAR_CURRENT_LINE);
      rl.write(hits[0] + " ");
    } else if (hits.length > 1) {
      // console.log("HITSSS");
      process.stdout.write(`\n${completions.join(" ")}\n`);
      process.stdout.write("\r$ " + rl.line.replaceAll("\t", ""));
    } else {
      // console.log("AUDIO");
      process.stdout.write("\r$ " + rl.line.trim() + AUDIO_CODE);
    }
  }

  if (key.ctrl && key.name === "c") {
    console.log("Exiting...");
    process.exit();
  }
});
