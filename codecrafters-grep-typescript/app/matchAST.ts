import { DIGITS, ALPHA } from "./constants.js";
import type { RegexAST } from "./regexAST.js";

type Position = {
  position: number;
  groups: string[];
}[];

export class MatchAST {
  private static groupIndex = 0;

  private static assignGroupIndices(node: RegexAST): void {
    switch (node.type) {
      case "Sequence":
        node.elements.forEach(this.assignGroupIndices.bind(this));
        break;
      case "Alternative":
        node.options.forEach(this.assignGroupIndices.bind(this));
        break;
      case "Quantifier":
        this.assignGroupIndices(node.child);
        break;
      case "Group":
        node.index = ++this.groupIndex;
        this.assignGroupIndices(node.child);
        break;
    }
  }

  public static matchAST(
    node: RegexAST,
    i: number,
    inputLine: string
  ): boolean {
    this.groupIndex = 0;
    this.assignGroupIndices(node);

    const posAndGroupsArr: Position = this.match(node, i, [], inputLine);

    return posAndGroupsArr.some(({ position }) => position > -1);
  }

  private static match(
    node: RegexAST,
    i: number,
    groups: string[],
    inputLine: string
  ): { position: number; groups: string[] }[] {
    switch (node.type) {
      case "Sequence": {
        let posAndGroupsArr: Position = [{ position: i, groups }];

        for (const el of node.elements) {
          const nextPosAndGroupsArr: Position = [];

          for (const { position: p, groups: g } of posAndGroupsArr) {
            if (p > -1) {
              nextPosAndGroupsArr.push(...this.match(el, p, g, inputLine));
            }
          }
          posAndGroupsArr = nextPosAndGroupsArr;

          if (!posAndGroupsArr.some(({ position }) => position > -1)) {
            break;
          }
        }

        return posAndGroupsArr;
      }

      case "Literal":
        if (inputLine[i] === node.value) {
          return [{ groups, position: ++i }];
        } else {
          return [{ position: -1, groups }];
        }

      case "Digit":
        if (DIGITS.includes(inputLine[i])) {
          return [{ position: ++i, groups }];
        } else {
          return [{ position: -1, groups }];
        }

      case "Anchor":
        if (node.kind === "start") {
          return i === 0
            ? [{ position: i, groups }]
            : [{ position: -1, groups }];
        } else {
          return i === inputLine.length
            ? [{ position: i, groups }]
            : [{ position: -1, groups }];
        }

      case "Word":
        if (ALPHA.includes(inputLine[i]) || DIGITS.includes(inputLine[i])) {
          return [{ position: ++i, groups }];
        } else {
          return [{ position: -1, groups }];
        }

      case "BackReference":
        const backRef: string = groups[node.index] || "";
        if (backRef && inputLine.startsWith(backRef, i)) {
          return [{ position: i + backRef.length, groups }];
        } else {
          return [{ position: -1, groups }];
        }

      case "CharClass":
        const match: boolean = node.negated
          ? !node.chars.includes(inputLine[i])
          : node.chars.includes(inputLine[i]);

        if (match && i < inputLine.length) {
          return [{ position: ++i, groups }];
        } else {
          return [{ position: -1, groups }];
        }

      case "Wildcard":
        if (i < inputLine.length) {
          return [{ position: ++i, groups }];
        } else {
          return [{ position: -1, groups }];
        }

      case "Alternative":
        return node.options.flatMap((node) =>
          this.match(node, i, groups, inputLine)
        );

      case "Quantifier":
        if (
          node.quant === "+" ||
          node.quant === "*" ||
          node.quant.startsWith("{")
        ) {
          let [allPosAndGroupsArr, matchedTimesNum]: [Position, number] =
            this.matchNTimes(node.child, groups, inputLine, i);

          // '*'
          if (
            node.quant === "*" &&
            allPosAndGroupsArr.every(({ position }) => position === -1)
          ) {
            return (allPosAndGroupsArr = [{ position: ++i, groups }]);
          }

          // '{}'
          else if (node.quant.startsWith("{")) {
            const {
              min,
              max,
              exactlyNTimes,
            }: {
              min: number;
              max: number;
              exactlyNTimes: number;
            } = this.parseQuant(node.quant);
            if (
              this.matchedTimesNumEligible(
                matchedTimesNum,
                min,
                max,
                exactlyNTimes
              )
            ) {
              return allPosAndGroupsArr;
            } else {
              return (allPosAndGroupsArr = [{ position: -1, groups }]);
            }
          }

          // '+'
          else {
            return allPosAndGroupsArr;
          }
        }

        // '?'
        else {
          const posAndGroupsArr: Position = this.match(
            node.child,
            i,
            groups,
            inputLine
          );

          return posAndGroupsArr.map(
            ({ position: newPos, groups: newGroups }) => {
              if (newPos > -1) {
                return { position: newPos, groups: newGroups };
              } else {
                return { position: i, groups };
              }
            }
          );
        }

      case "Group":
        const posAndGroupsArr: Position = this.match(
          node.child,
          i,
          groups,
          inputLine
        );

        return posAndGroupsArr.map(
          ({ position: groupEndIndex, groups: newGroups }) => {
            if (groupEndIndex > -1) {
              newGroups[node.index] = inputLine.slice(i, groupEndIndex);
              return { position: groupEndIndex, groups: newGroups };
            } else {
              return { position: -1, groups };
            }
          }
        );

      default:
        throw new Error("Unhandled exception");
    }
  }

  private static matchNTimes(
    node: RegexAST,
    groups: string[],
    inputLine: string,
    i: number
  ): [Position, number] {
    let matchedTimesNum: number = 0;
    let posAndGroupsResult: Position = this.match(node, i, groups, inputLine);
    let allPosAndGroupsArr: Position = [...posAndGroupsResult];

    while (true) {
      if (!posAndGroupsResult.some(({ position }) => position > -1)) {
        break;
      }
      matchedTimesNum++;

      let nextResults: Position = [];
      posAndGroupsResult.forEach(({ position, groups }) => {
        if (position > -1) {
          nextResults.push(...this.match(node, position, groups, inputLine));
          allPosAndGroupsArr.push(...nextResults);
        }
      });

      posAndGroupsResult = nextResults;
    }

    return [allPosAndGroupsArr, matchedTimesNum];
  }

  private static parseQuant(quant: string): {
    min: number;
    max: number;
    exactlyNTimes: number;
  } {
    if (!quant.startsWith("{") && !quant.endsWith("}")) {
      throw new Error("Invalid quant");
    }

    let min: number = -999;
    let max: number = -999;
    let exactlyNTimes: number = -999;

    if (quant.includes(",")) {
      [min, max] = quant
        .slice(1, -1)
        .split(",")
        .filter((val) => !!val)
        .map((val) => Number.parseInt(val));
    } else {
      exactlyNTimes = Number.parseInt(quant.slice(1, -1));
    }

    return { min, max, exactlyNTimes };
  }

  private static matchedTimesNumEligible(
    matchedTimesNum: number,
    min: number,
    max: number,
    exactlyNTimes: number
  ): boolean {
    // {n}
    if (exactlyNTimes > 0 && matchedTimesNum === exactlyNTimes) {
      return true;
    }

    // {n, m}
    else if (
      min > 0 &&
      max > 0 &&
      matchedTimesNum >= min &&
      matchedTimesNum <= max
    ) {
      return true;
    }

    // {n,}
    else if (min > 0 && matchedTimesNum >= min) {
      return true;
    }

    // no match
    else {
      return false;
    }
  }
}
