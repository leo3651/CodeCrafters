import { createHash } from "crypto";
import * as net from "net";
import { Response } from "../response";
import { redisProtocolEncoder } from "../protocol/redisProtocolEncoder";
import type { User } from "../models/model";
import { socketsInfo } from "../socketsInfo";

class Authentication {
  private users: Record<string, User> = {
    default: {
      flags: new Set(["nopass"]),
      passwords: new Set(),
    },
  };

  public auth(socket: net.Socket, command: string[]): void {
    const userName: string = command[1];
    const password: string = command[2];

    if (this.isAuthenticated(userName, password)) {
      this.markAsAuthenticated(userName, socket);
      Response.handle(socket, redisProtocolEncoder.encodeSimpleString("OK"));
    } else {
      Response.handle(
        socket,
        redisProtocolEncoder.encodeSimpleError("WRONGPASS"),
      );
    }
  }

  public acl(socket: net.Socket, command: string[]): void {
    switch (command[1].toLowerCase()) {
      case "whoami":
        this.whoAmI(socket);
        break;

      case "getuser":
        const userName: string = command[2];
        Response.handle(
          socket,
          redisProtocolEncoder.encodeRespArr(this.getUser(userName)),
        );
        break;

      case "setuser": {
        const userName: string = command[2];
        const password: string = command[3].slice(1);
        this.setUser(userName, password);
        Response.handle(socket, redisProtocolEncoder.encodeSimpleString("OK"));
        break;
      }

      default:
        break;
    }
  }

  private whoAmI(socket: net.Socket): void {
    Response.handle(
      socket,
      redisProtocolEncoder.encodeBulkString(
        socketsInfo.getInfo(socket).userName,
      ),
    );
  }

  private getUser(name: string): (string[] | string)[] {
    const user: User = this.users[name];
    if (!user) {
      return [];
    }

    return [
      "flags",
      user.flags.values().toArray(),
      "passwords",
      user.passwords.values().toArray(),
    ];
  }

  private setUser(name: string, password: string) {
    const user: User = this.users[name];
    const hashedPassword: string = createHash("sha256")
      .update(password)
      .digest("hex");

    if (!user) {
      this.users[name] = {
        flags: new Set(),
        passwords: new Set(),
      };
    }

    user.flags.delete("nopass");
    user.passwords.add(hashedPassword);
  }

  private isAuthenticated(userName: string, password: string): boolean {
    const hashedPassword: string = createHash("sha256")
      .update(password)
      .digest("hex");

    return this.users[userName]?.passwords?.has(hashedPassword);
  }

  private markAsAuthenticated(userName: string, socket: net.Socket) {
    socketsInfo.getInfo(socket).isAuthenticated = true;
    socketsInfo.getInfo(socket).userName = userName;
  }

  public defaultUserIsAuthenticated(): boolean {
    return this.users.default.flags.has("nopass");
  }

  public isNonAuthenticatedCommand(socket: net.Socket, command: string[]) {
    if (socketsInfo.getInfo(socket).isAuthenticated) {
      return false;
    } else {
      if (
        command[0].toLowerCase() === "auth" ||
        (command[0].toLowerCase() === "acl" &&
          command[1].toLowerCase() === "setuser")
      ) {
        return false;
      } else {
        return true;
      }
    }
  }
}

const authentication: Authentication = new Authentication();
export { authentication };
