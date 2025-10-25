import { MatchAST } from "./matchAST";
import { RegexASTHandler, type RegexAST } from "./regexAST";
import { Tokenizer } from "./tokenizer";
import fs from "fs";

/*
matchPattern("pzzzq", "p[xyz]{2,3}q");
matchPattern("n123m", "n\\d{1,3}m");
matchPattern("caaaaat", "ca{2,4}t");
matchPattern("caaat", "ca*t");
matchPattern("kabct", "k[abc]*t");
matchPattern("kt", "k\\d*t");
matchPattern(
  "abc-def is abc-def, not xyz",
  "'([abc]+)-([def]+) is \\1-\\2, not [^xyz]+'"
);
matchPattern("caaats", "ca+at");
matchPattern("cat and dog", "(\\w+) and \\1");
matchPattern(
  "I see 1 cat, 2 dogs and 3 cows",
  "^I see (\\d (cat|dog|cow)s?(, | and )?)+$"
);
matchPattern(
  "grep 101 is doing grep 101 times, and again grep 101 times",
  "((\\w\\w\\w\\w) (\\d\\d\\d)) is doing \\2 \\3 times, and again \\1 times"
);
*/

const args: string[] = process.argv;
const pattern: string = args[3];
const filePaths: string[] = args.slice(4);

const dirPath: string = args[5];
const recursiveDirSearch: string = args[2];
const dirRecSearchPattern: string = args[4];

const inputLine: string = await Bun.stdin.text();

// console.log(args);
// console.log(`Input Line: ${inputLine}`);
// console.log(`Pattern: ${pattern}, len: ${pattern.length}`);
// console.log("\n");

if (args[2] !== "-E" && args[2] !== "-r") {
  console.log("Expected first argument to be '-E' or '-r'");
  process.exit(1);
}

// Log all matching lines from given files or directory
if ((dirPath && recursiveDirSearch === "-r") || filePaths.length) {
  let matchedLines: string[][] = [];

  // Directory
  if (dirPath && recursiveDirSearch === "-r") {
    matchedLines = getMatchedLinesFromDirectory(
      dirPath.slice(0, -1),
      dirRecSearchPattern
    ).filter((arr) => arr.length);
  }

  // Files
  else {
    matchedLines = getMatchedLinesFromFiles(filePaths, pattern);
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
  if (matchPattern(inputLine, pattern)) {
    console.log("Character is found. Exiting with 0...");
    process.exit(0);
  } else {
    console.log("Character is NOT found. Exiting with 1...");
    process.exit(1);
  }
}

function matchPattern(input: string, pattern: string) {
  const tokens: string[] = Tokenizer.tokenize(pattern);
  // console.log(tokens);

  const [ast]: [RegexAST, number] = RegexASTHandler.createRegexSAT(tokens, 0);
  // console.dir(ast, { depth: null, color: true });

  for (let i = 0; i < input.length + 1; i++) {
    if (MatchAST.matchAST(ast, i, input)) {
      return true;
    }
  }
  return false;
}

function getMatchedLinesFromFile(
  filePath: string,
  pattern: string,
  withFileName: boolean
) {
  const fileContent: Buffer = fs.readFileSync(filePath);
  let textContent: string = "";
  const matchedLines: string[] = [];

  try {
    textContent = fileContent.toString();
  } catch (err) {
    throw new Error("Could not convert to a string");
  }

  textContent.split("\n").forEach((line) => {
    if (matchPattern(line, pattern)) {
      if (withFileName) {
        matchedLines.push(`${filePath}:${line}`);
      } else {
        matchedLines.push(line);
      }
    }
  });

  return matchedLines;
}

function getMatchedLinesFromFiles(
  filePaths: string[],
  pattern: string
): string[][] {
  const matchedLines: string[][] = [];

  filePaths.forEach((filePath) => {
    const matchedLinesResults: string[] = getMatchedLinesFromFile(
      filePath,
      pattern,
      filePaths.length > 1
    );
    if (matchedLinesResults.length) {
      matchedLines.push(matchedLinesResults);
    }
  });

  return matchedLines;
}

function getMatchedLinesFromDirectory(
  path: string,
  pattern: string
): string[][] {
  const matchedLines: string[][] = [];

  fs.readdirSync(path, { withFileTypes: true }).forEach((dirSubPath) => {
    // File
    if (dirSubPath.isFile()) {
      matchedLines.push(
        getMatchedLinesFromFile(`${path}/${dirSubPath.name}`, pattern, true)
      );
    }

    // Dir
    else if (dirSubPath.isDirectory()) {
      matchedLines.push(
        ...getMatchedLinesFromDirectory(`${path}/${dirSubPath.name}`, pattern)
      );
    }
  });

  return matchedLines;
}
