export class Tokenizer {
  public static tokenize(pattern: string): string[] {
    const tokens: string[] = [];
    let i: number = 0;

    // Anchors
    const hasAnchorStart = pattern[0] === "^";
    const hasAnchorEnd = pattern[-1] === "$";

    if (hasAnchorStart) {
      tokens.push("^");
      pattern = pattern.slice(1);
    }
    if (hasAnchorEnd) {
      pattern = pattern.slice(0, -1);
    }

    while (i < pattern.length) {
      if (pattern[i] === "\\") {
        if (i + 1 < pattern.length) {
          tokens.push(pattern.slice(i, i + 2));
          i += 2;
        } else {
          throw new Error(`Unexpected end of pattern ${pattern[i]}`);
        }
      } 
      
      else if (pattern[i] === "[") {
        if (i + 1 < pattern.length) {
          let j = i + 1;
          while (j < pattern.length && pattern[j] !== "]") {
            j++;
          }

          if (j < pattern.length) {
            tokens.push(pattern.slice(i, j + 1));
            i = j + 1;
          } else {
            throw new Error(`No closing ']'`);
          }
        } else {
          throw new Error(`Unexpected end of pattern ${pattern[i]}`);
        }
      } 
      
      else if (pattern[i] === ".") {
        tokens.push("WILDCARD");
        i++;
      } 
      
      else if (
        (pattern[i + 1] === "+" ||
          pattern[i + 1] === "?" ||
          pattern[i + 1] === "*") &&
        pattern[i] !== ")" &&
        pattern[i] !== "."
      ) {
        tokens.push(pattern[i] + pattern[i + 1]);
        i += 2;
      } 
      
      else {
        tokens.push(pattern[i]);
        i++;
      }
    }

    if (hasAnchorEnd) {
      tokens.push("$");
    }

    return tokens;
  }
}
