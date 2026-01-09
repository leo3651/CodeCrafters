import fs from "fs";
import { Results } from "./results";

export class FileSearch {
  public static getMatchedLinesFromFile(
    filePath: string,
    pattern: string,
    withFileName: boolean
  ): string[] {
    const fileContent: Buffer = fs.readFileSync(filePath);
    let textContent: string = "";
    const matchedLines: string[] = [];

    try {
      textContent = fileContent.toString();
    } catch (err) {
      throw new Error("Could not convert to a string");
    }

    textContent.split("\n").forEach((line: string) => {
      const matchedLine: string | null = Results.getMatch(line, pattern);

      if (matchedLine) {
        if (withFileName) {
          matchedLines.push(`${filePath}:${matchedLine}`);
        } else {
          matchedLines.push(matchedLine);
        }
      }
    });

    return matchedLines;
  }

  public static getMatchedLinesFromFiles(
    filePaths: string[],
    pattern: string
  ): string[][] {
    const matchedLines: string[][] = [];

    filePaths.forEach((filePath) => {
      const matchedLinesResults: string[] = this.getMatchedLinesFromFile(
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

  public static getMatchedLinesFromDirectory(
    path: string,
    pattern: string
  ): string[][] {
    const matchedLines: string[][] = [];

    fs.readdirSync(path, { withFileTypes: true }).forEach((dirSubPath) => {
      // File
      if (dirSubPath.isFile()) {
        matchedLines.push(
          this.getMatchedLinesFromFile(
            `${path}/${dirSubPath.name}`,
            pattern,
            true
          )
        );
      }

      // Dir
      else if (dirSubPath.isDirectory()) {
        matchedLines.push(
          ...this.getMatchedLinesFromDirectory(
            `${path}/${dirSubPath.name}`,
            pattern
          )
        );
      }
    });

    return matchedLines;
  }
}
