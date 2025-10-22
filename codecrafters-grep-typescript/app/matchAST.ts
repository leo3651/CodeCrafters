import { DIGITS, ALPHA } from "./constants.js";
import type { RegexAST } from "./regexAST.js";

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

    const posAndGroupsArr = this.match(node, i, [], inputLine);

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
        let posAndGroupsArr = [{ position: i, groups }];

        for (const el of node.elements) {
          const nextPosAndGroupsArr: {
            position: number;
            groups: string[];
          }[] = [];

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

      case "Quantifier":
        if (node.quant === "+" || node.quant === "*") {
          let posAndGroupsResult = this.match(node.child, i, groups, inputLine);
          let allPosAndGroupsArr = [...posAndGroupsResult];

          while (true) {
            if (!posAndGroupsResult.some(({ position }) => position > -1)) {
              break;
            }

            let nextResults: { position: number; groups: string[] }[] = [];
            posAndGroupsResult.forEach(({ position, groups }) => {
              if (position > -1) {
                nextResults.push(
                  ...this.match(node.child, position, groups, inputLine)
                );
                allPosAndGroupsArr.push(...nextResults);
              }
            });

            posAndGroupsResult = nextResults;
          }

          if (
            node.quant === "*" &&
            allPosAndGroupsArr.every(({ position }) => position === -1)
          ) {
            allPosAndGroupsArr = [{ position: ++i, groups }];
          }

          return allPosAndGroupsArr;
        } else {
          const posAndGroupsArr = this.match(node.child, i, groups, inputLine);

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

      case "Group":
        const posAndGroupsArr = this.match(node.child, i, groups, inputLine);

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

      case "BackReference":
        const backRef = groups[node.index] || "";
        if (backRef && inputLine.startsWith(backRef, i)) {
          return [{ position: i + backRef.length, groups }];
        } else {
          return [{ position: -1, groups }];
        }

      case "CharClass":
        const match = node.negated
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

      default:
        throw new Error("Unhandled exception");
    }
  }
}
