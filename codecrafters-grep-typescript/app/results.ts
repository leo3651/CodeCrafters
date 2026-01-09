import { Display } from "./display";
import { MatchAST } from "./matchAST";
import type { RegexAST, Position } from "./model";
import { RegexASTHandler } from "./regexAST";
import { Tokenizer } from "./tokenizer";

export class Results {
  public static getMatch(input: string, pattern: string): string | null {
    const positions: Position[] = [];
    const tokens: string[] = Tokenizer.tokenize(pattern);
    // console.log(tokens);

    const [ast]: [RegexAST, number] = RegexASTHandler.createRegexSAT(tokens, 0);
    // console.dir(ast, { depth: null, color: true });

    for (let i = 0; i < input.length + 1; i++) {
      const pos: Position | null = MatchAST.getPosition(ast, i, input);
      if (pos) {
        positions.push(pos);
      }
    }

    if (positions.length > 0) {
      return Display.prepareLineForDisplay(input, positions);
    } else {
      return null;
    }
  }

  public static getMatchedLinesFromInput(
    input: string,
    pattern: string
  ): string[] {
    return input
      .split("\n")
      .map((line: string) => Results.getMatch(line, pattern))
      .filter((match) => match !== null);
  }
}
