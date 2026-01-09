import { RED, RESET } from "./constants";
import type { Position } from "./model";

export class Display {
  public static highlightEnabled: boolean = false;
  public static onlyMatching: boolean = false;

  public static prepareLineForDisplay(
    input: string,
    positions: Position[]
  ): string {
    let matchedLine: string = input;
    let singleMatches: string[] = positions.map(
      ({ positionStart, positionEnd }) =>
        input.slice(positionStart, positionEnd)
    );

    if (this.highlightEnabled) {
      singleMatches = singleMatches.map((match) => `${RED}${match}${RESET}`);
      matchedLine = this.highlightString(input, positions);
    }

    if (this.onlyMatching) {
      return singleMatches.join("\n");
    } else {
      return matchedLine;
    }
  }

  public static highlightString(
    strToHighlight: string,
    positions: Position[]
  ): string {
    return strToHighlight
      .split("")
      .map((span: string, i: number) => {
        if (
          positions.some(
            ({ positionEnd, positionStart }: Position) =>
              i >= positionStart! && i < positionEnd
          )
        ) {
          return `${RED}${span}${RESET}`;
        }
        return span;
      })
      .join("");
  }
}
