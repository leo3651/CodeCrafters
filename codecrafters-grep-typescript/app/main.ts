import { Display } from "./display";
import { FileSearch } from "./fileSearch";
import { Results } from "./results";

/*
getMatch("pzzzq", "p[xyz]{2,3}q");
getMatch("n123m", "n\\d{1,3}m");
getMatch("caaaaat", "ca{2,4}t");
getMatch("caaat", "ca*t");
getMatch("kabct", "k[abc]*t");
getMatch("kt", "k\\d*t");
getMatch(
  "abc-def is abc-def, not xyz",
  "'([abc]+)-([def]+) is \\1-\\2, not [^xyz]+'"
);
getMatch("caaats", "ca+at");
getMatch("cat and dog", "(\\w+) and \\1");
getMatch(
  "I see 1 cat, 2 dogs and 3 cows",
  "^I see (\\d (cat|dog|cow)s?(, | and )?)+$"
);
getMatch(
  "grep 101 is doing grep 101 times, and again grep 101 times",
  "((\\w\\w\\w\\w) (\\d\\d\\d)) is doing \\2 \\3 times, and again \\1 times"
);
*/

const args: string[] = process.argv;

const indexOfE: number = args.indexOf("-E") || args.indexOf("-P");
const flags: string[] = args.slice(0, indexOfE);

const dirPath: string = flags.includes("-r") ? args[indexOfE + 2] : "";
const pattern: string = args[indexOfE + 1];
const filePaths: string[] = args.slice(indexOfE + 2);
const colorAuto: boolean = flags.includes("--color=auto");
Display.highlightEnabled =
  flags.includes("--color=always") ||
  (colorAuto && process.stdout.isTTY === true);
Display.onlyMatching = flags.includes("-o");

const inputLine: string = await Bun.stdin.text();

// Log all matching lines from given files or directory
if (dirPath || filePaths.length) {
  let matchedLines: string[][] = [];

  // Directory
  if (dirPath) {
    matchedLines = FileSearch.getMatchedLinesFromDirectory(
      dirPath.slice(0, -1),
      pattern
    ).filter((arr) => arr.length);
  }
  // Files
  else {
    matchedLines = FileSearch.getMatchedLinesFromFiles(filePaths, pattern);
  }

  if (matchedLines.length) {
    matchedLines.forEach((file) => {
      file.forEach((matchedLine) => console.log(matchedLine));
    });
    process.exit(0);
  } else {
    process.exit(1);
  }
}

// Compare given pattern and input
else {
  const matchedLines: string[] = Results.getMatchedLinesFromInput(
    inputLine,
    pattern
  );

  if (matchedLines.length) {
    matchedLines.forEach((line) => console.log(line));
    process.exit(0);
  } else {
    process.exit(1);
  }
}
