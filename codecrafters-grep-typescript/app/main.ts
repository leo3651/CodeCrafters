import { MatchAST } from "./matchAST";
import { RegexASTHandler } from "./regexAST";
import { Tokenizer } from "./tokenizer";

/*
matchPattern("banana", "[^anb]");
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

const args = process.argv;
const pattern = args[3];
const inputLine: string = await Bun.stdin.text();

console.log(`Input Line: ${inputLine}`);
console.log(`Pattern: ${pattern}, len: ${pattern.length}`);
console.log("\n");

if (args[2] !== "-E" && args[2] !== "-r") {
  console.log("Expected first argument to be '-E' or '-r'");
  process.exit(1);
}

if (matchPattern(inputLine, pattern)) {
  console.log("Character is found. Exiting with 0...");
  process.exit(0);
} else {
  console.log("Character is NOT found. Exiting with 1...");
  process.exit(1);
}

function matchPattern(input: string, pattern: string) {
  const tokens = Tokenizer.tokenize(pattern);
  console.log(tokens);

  const [ast] = RegexASTHandler.createRegexSAT(tokens, 0);
  console.dir(ast, { depth: null, color: true });

  let hasAnchorStart = false;
  let hasAnchorEnd = false;

  if (tokens[0] === "^") {
    hasAnchorStart = true;
  }
  if (tokens.at(-1) === "$") {
    hasAnchorEnd = true;
  }

  const maxStart = hasAnchorStart ? 1 : input.length + 1;
  for (let i = 0; i < maxStart; i++) {
    if (hasAnchorStart && i !== 0) break;
    if (MatchAST.matchAST(ast, i, input)) {
      return true;
    }
  }
  return false;
}
