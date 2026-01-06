import { CommandOutput, Commands } from "./commands";
import fs from "fs";

export class Redirect {
  public static handleRedirectCommand(line: string): string {
    let returnValue: string = "";
    const [wholeCommand, file]: string[] = line.split(
      line.includes(" 1> ")
        ? " 1> "
        : line.includes(" > ")
        ? " > "
        : line.includes(" 2> ")
        ? " 2> "
        : line.includes(" >> ")
        ? " >> "
        : line.includes(" 1>> ")
        ? " 1>> "
        : " 2>> "
    );

    const commandOutput: CommandOutput = Commands.execute(wholeCommand);

    const append: boolean =
      line.includes(" 1>> ") || line.includes(" >> ") || line.includes(" 2>> ");

    fs.writeFileSync(
      file,
      line.includes(" 2> ") || line.includes(" 2>> ")
        ? `${commandOutput.stderr.join("")}`
        : `${commandOutput.stdout.join("")}`,
      {
        flag: append ? "a" : "w",
      }
    );

    if (line.includes(" 2> ") || line.includes(" 2>> ")) {
      returnValue = commandOutput.stdout.join("");
    } else {
      returnValue = commandOutput.stderr.join("");
    }

    return returnValue;
  }

  public static isRedirectCommand(answer: string): boolean {
    return (
      answer.includes(" > ") ||
      answer.includes(" 1> ") ||
      answer.includes(" 2> ") ||
      answer.includes(" 1>> ") ||
      answer.includes(" >> ") ||
      answer.includes(" 2>> ")
    );
  }
}
