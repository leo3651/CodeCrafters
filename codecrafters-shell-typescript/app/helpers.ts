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
        }, [])
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
  constructor(public filePaths: string[], public finalString: string) {}

  public static handleQuotes(str: string): QuotesHandler {
    let i: number = 0;
    let finalString: string = "";
    const filePaths: string[] = [];
    const specialChars: string[] = ['"', "\\"];

    while (i < str.length) {
      // Handle double quotes
      if (
        (str[i] === '"' && i - 1 >= 0 && str[i - 1] !== "\\") ||
        (i === 0 && str[i] === '"')
      ) {
        let insideDoubleQuotesStr: string[] = [];
        i++;

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

        filePaths.push(insideDoubleQuotesStr.join(""));
        finalString += insideDoubleQuotesStr.join("");
      }

      // Handle single quotes
      else if (str[i] === "'") {
        i++;
        let start = i;

        while (str[i] !== "'") {
          i++;
        }

        filePaths.push(str.slice(start, i));
        finalString += str.slice(start, i);
      }

      // Handle space char
      else if (str[i] === " ") {
        if (finalString[finalString.length - 1] !== " ") {
          finalString += " ";
        }
      }

      // Handle unquoted strings
      else {
        const outsideQuotesStr: string[] = [];

        while (true) {
          if (i > str.length - 1) {
            break;
          }

          // Handle backslash
          else if (str[i] === "\\") {
            outsideQuotesStr.push(str[i + 1]);
            i++;
          }

          // Handle space
          else if (str[i] === " ") {
            outsideQuotesStr.push(str[i]);
            break;
          }

          // Handle quotes
          else if (str[i] === "'" || str[i] === '"') {
            i--;
            break;
          }

          // Building the word
          else {
            outsideQuotesStr.push(str[i]);
          }
          i++;
        }

        finalString += outsideQuotesStr.join("");
        filePaths.push(outsideQuotesStr.join("").trim());
      }

      i++;
    }

    return new QuotesHandler(filePaths, finalString);
  }
}
