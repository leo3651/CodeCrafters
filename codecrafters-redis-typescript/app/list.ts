import * as net from "net";
import { redisProtocolEncoder } from "./redisProtocolEncoder";

class List {
  lists: { [key: string]: string[] } = {};

  public rPush(socket: net.Socket, command: string[]): void {
    const listKey = command[1];
    const elements = command.slice(2);

    // Get or create the list
    const list = (this.lists[listKey] ??= []);

    list.push(...elements);

    socket.write(redisProtocolEncoder.encodeNumber(`${list.length}`));
  }
}

const list: List = new List();
export { list };
