import { redisFile } from "./redisFile";
import { redisProtocolEncoder } from "./redisProtocolEncoder";
import { Response } from "./response";
import * as net from "net";

export class Dictionary {
  private static DICTIONARY: { [key: string]: string } = {};

  public static set(command: string[]): void {
    const key: string = command[1];
    const value: string = command[2];

    this.DICTIONARY[key] = value;

    if (command[3]?.toLowerCase() === "px") {
      const expiryTime: number = Number.parseInt(command[4]);

      setTimeout(() => {
        delete this.DICTIONARY[key];
      }, expiryTime);
    }
  }

  public static get(command: string[]): string {
    const key: string = command[1];
    const value: string =
      this.DICTIONARY[key] ||
      redisFile.KEY_VAL_WITHOUT_EXPIRY[key] ||
      redisFile.KEY_VAL_WITH_EXPIRY[key];

    return value;
  }

  public static keys(command: string[]): string[] {
    if (command[1] === "*") {
      return [
        ...Object.keys(redisFile.KEY_VAL_WITHOUT_EXPIRY),
        ...Object.keys(redisFile.KEY_VAL_WITH_EXPIRY),
        ...Object.keys(this.DICTIONARY),
      ];
    } else {
      throw new Error("Unsupported keys arg");
    }
  }

  public static getValue(key: string): string {
    return this.DICTIONARY[key];
  }

  public static incr(socket: net.Socket, command: string[]): void {
    const key: string = command[1];
    let value: string = this.DICTIONARY[key];

    if (value) {
      let numberValue: number = +value;
      if (Number.isNaN(numberValue)) {
        Response.handle(
          socket,
          redisProtocolEncoder.encodeSimpleError(
            "ERR value is not an integer or out of range",
          ),
        );
        return;
      } else {
        numberValue++;
        this.DICTIONARY[key] = numberValue.toString();
      }
    } else {
      this.DICTIONARY[key] = "1";
    }

    Response.handle(
      socket,
      redisProtocolEncoder.encodeNumber(this.DICTIONARY[key]),
    );
  }
}
