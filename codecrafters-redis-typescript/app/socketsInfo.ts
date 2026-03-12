import * as net from "net";
import { ExecutionType, type SocketInfo } from "./models/model";

class SocketsInfo {
  public sockets: SocketInfo[] = [];

  public add(socket: net.Socket): void {
    this.sockets.push({
      socket,
      processedBytes: 0,
      numberOfResponses: 0,
      propagatedBytes: 0,
      queuedCommands: [],
      queuedReplies: [],
      isReplica: false,
      executionType: ExecutionType.Regular,
      blockPopTimeout: null,
      listElAddedSubscription: null,
      subscriptions: {},
    });
  }

  public remove(socket: net.Socket): void {
    this.sockets = this.sockets.filter(
      (socketInfo: SocketInfo) => socketInfo.socket !== socket,
    );
  }

  public getInfo(socket: net.Socket): SocketInfo {
    return this.sockets.find(
      (socketInfo: SocketInfo) => socketInfo.socket === socket,
    )!;
  }

  public getReplicas(): SocketInfo[] {
    return this.sockets.filter(
      (socketInfo: SocketInfo) => socketInfo.isReplica,
    );
  }
}

const socketsInfo: SocketsInfo = new SocketsInfo();
export { socketsInfo };
