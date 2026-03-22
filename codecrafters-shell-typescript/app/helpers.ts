import path from "path";
import fs from "fs";

export async function getExecutables(): Promise<string[]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const paths: string[] = process.env.PATH
        ? process.env.PATH.split(path.delimiter)
        : [];
      resolve(
        paths.reduce((files: string[], p: string) => {
          try {
            fs.readdirSync(p).forEach((file) => {
              fs.accessSync(path.join(p, file), fs.constants.X_OK);
              files.push(file);
            });
          } catch (err) {}

          return files;
        }, []),
      );
    });
  });
}

export function getLongestCommonPrefix(items: string[]): string {
  if (items.length === 0) {
    return "";
  }

  const sorted: string[] = [...items].sort();
  const first: string = sorted[0];
  const last: string = sorted[sorted.length - 1];

  if (last.includes(first)) {
    return first;
  } else return "";
}

export class QuotesHandler {
  constructor(
    public finalString: string,
    public words: string[],
  ) {}

  public static handleQuotesAndBackslashes(str: string): QuotesHandler {
    let i: number = 0;
    let finalString: string = "";
    const words: string[] = [];

    while (i < str.length) {
      // Handle double quotes
      if (
        (str[i] === '"' && i - 1 >= 0 && str[i - 1] !== "\\") ||
        (i === 0 && str[i] === '"')
      ) {
        i++;
        const { doubleQuotedString, newIndex } = this.handleDoubleQuotes(
          i,
          str,
        );
        finalString += doubleQuotedString;
        i = newIndex;
      }

      // Handle single quotes
      else if (str[i] === "'") {
        i++;
        const { newIndex, singleQuotedString } = this.handleSingleQuotes(
          i,
          str,
        );
        finalString += singleQuotedString;
        i = newIndex;
      }

      // Handle space char
      else if (str[i] === " ") {
        if (finalString[finalString.length - 1] !== " ") {
          this.fillWordsArr(finalString, words);
          finalString += " ";
        }
      }

      // Handle unquoted strings
      else {
        const { newIndex, unquotedString } = this.handleUnquotedString(i, str);
        finalString += unquotedString;
        i = newIndex;
      }

      i++;
    }

    if (finalString.length !== words.join("").length + words.length) {
      this.fillWordsArr(finalString, words);
    }

    return new QuotesHandler(finalString, words);
  }

  private static fillWordsArr(finalString: string, words: string[]): void {
    if (words.at(-1)) {
      words.push(finalString.slice(words.join("").length + words.length));
    } else {
      words.push(finalString);
    }
  }

  private static handleSingleQuotes(
    i: number,
    str: string,
  ): {
    newIndex: number;
    singleQuotedString: string;
  } {
    let start: number = i;

    while (str[i] !== "'") {
      i++;
    }

    return { singleQuotedString: str.slice(start, i), newIndex: i };
  }

  private static handleDoubleQuotes(
    i: number,
    str: string,
  ): {
    newIndex: number;
    doubleQuotedString: string;
  } {
    const specialChars: string[] = ['"', "\\"];
    let insideDoubleQuotesStr: string[] = [];

    while (true) {
      if (str[i] === '"' && i - 1 >= 0 && str[i - 1] !== "\\") {
        break;
      }

      if (i === str.length - 1 && str[i] === '"' && str[i - 1] === "\\") {
        break;
      }

      if (str[i] === "\\" && specialChars.includes(str[i + 1])) {
        insideDoubleQuotesStr.push(str[i + 1]);
        i++;
      } else {
        insideDoubleQuotesStr.push(str[i]);
      }
      i++;
    }

    return { newIndex: i, doubleQuotedString: insideDoubleQuotesStr.join("") };
  }

  private static handleUnquotedString(
    i: number,
    str: string,
  ): {
    newIndex: number;
    unquotedString: string;
  } {
    const outsideQuotesChars: string[] = [];

    while (true) {
      if (i > str.length - 1) {
        break;
      }

      // Handle backslash
      else if (str[i] === "\\") {
        outsideQuotesChars.push(str[i + 1]);
        i++;
      }

      // Handle quotes and space char
      else if (str[i] === "'" || str[i] === '"' || str[i] === " ") {
        i--;
        break;
      }

      // Building the word
      else {
        outsideQuotesChars.push(str[i]);
      }
      i++;
    }

    return { newIndex: i, unquotedString: outsideQuotesChars.join("") };
  }
}
