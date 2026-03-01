import * as net from "net";
import { redisProtocolEncoder } from "./redisProtocolEncoder";

class List {
  private lists: { [key: string]: string[] } = {};

  public rPush(socket: net.Socket, command: string[]): void {
    const listKey: string = command[1];
    const elements: string[] = command.slice(2);

    // Get or create the list
    const list: string[] = (this.lists[listKey] ??= []);

    list.push(...elements);

    socket.write(redisProtocolEncoder.encodeNumber(`${list.length}`));
  }

  public lrange(socket: net.Socket, command: string[]): void {
    const listKey = command[1];
    const lowBoundary = Number.parseInt(command[2]);
    const highBoundary = Number.parseInt(command[3]);

    const list: string[] = (this.lists[listKey] ??= []);

    socket.write(
      redisProtocolEncoder.encodeRespArr(
        list.slice(
          lowBoundary,
          highBoundary + 1 === 0 ? list.length : highBoundary + 1,
        ),
      ),
    );
  }
}

const list: List = new List();
export { list };
