import type { RegexAST } from "./model";

export class RegexASTHandler {
  public static createRegexSAT(
    tokens: string[],
    start: number
  ): [RegexAST, number] {
    const elements: RegexAST[] = [];
    let i: number = start;

    while (i < tokens.length) {
      const token: string = tokens[i];

      if (token === "^") {
        elements.push({ type: "Anchor", kind: "start" });

        i++;
      } else if (token === "$") {
        elements.push({ type: "Anchor", kind: "end" });

        i++;
      } else if (token === ")") {
        return [{ type: "Sequence", elements }, i + 1];
      } else if (token === "\\d") {
        elements.push({ type: "Digit" });

        i++;
      } else if (token === "WILDCARD") {
        elements.push({ type: "Wildcard" });

        i++;
      } else if (token === "\\w") {
        elements.push({ type: "Word" });

        i++;
      } else if (token === "(") {
        const [child, newIndex]: [RegexAST, number] = this.createRegexSAT(
          tokens,
          i + 1
        );
        elements.push({ type: "Group", child, index: -999 });
        i = newIndex;
      } else if (token === "|") {
        const [right, newIndex]: [RegexAST, number] = this.createRegexSAT(
          tokens,
          i + 1
        );
        return [
          {
            type: "Alternative",
            options: [{ type: "Sequence", elements }, right],
          },
          newIndex,
        ];
      } else if (
        token.endsWith("+") ||
        token.endsWith("?") ||
        token.endsWith("*") ||
        token.endsWith("}")
      ) {
        let quant: string = "";

        if (token.endsWith("}")) {
          quant = token.slice(token.indexOf("{"), token.indexOf("}") + 1);
        } else {
          quant = token[token.length - 1];
        }

        if (elements.length) {
          const previous: RegexAST = elements.pop()!;
          elements.push({ type: "Quantifier", quant, child: previous });
        } else {
          throw new Error("Error creating SAT tree");
        }

        i++;
      } else if (
        token.length > 1 &&
        token[0] === "\\" &&
        token
          .slice(1)
          .split("")
          .every((ch) => "0123456789".includes(ch))
      ) {
        const index: number = parseInt(token.slice(1));
        elements.push({ type: "BackReference", index });

        i++;
      } else if (token.startsWith("[") && token.endsWith("]")) {
        const negated: boolean = token[1] === "^";
        const chars: string = negated ? token.slice(2, -1) : token.slice(1, -1);
        elements.push({ type: "CharClass", chars, negated });

        i++;
      } else {
        elements.push({ type: "Literal", value: token });

        i++;
      }
    }

    return [{ type: "Sequence", elements }, i];
  }
}
