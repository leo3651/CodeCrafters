import * as net from "net";
import { EExecutionType, type ISocketInfo } from "./models/model";

class SocketsInfo {
  public sockets: ISocketInfo[] = [];

  public add(socket: net.Socket): void {
    this.sockets.push({
      socket,
      processedBytes: 0,
      numberOfResponses: 0,
      propagatedBytes: 0,
      queuedCommands: [],
      queuedReplies: [],
      isReplica: false,
      executionType: EExecutionType.Regular,
      blockPopTimeout: null,
      listElAddedSubscription: null,
      subscriptions: {},
    });
  }

  public remove(socket: net.Socket): void {
    this.sockets = this.sockets.filter(
      (socketInfo: ISocketInfo) => socketInfo.socket !== socket,
    );
  }

  public getInfo(socket: net.Socket): ISocketInfo {
    return this.sockets.find(
      (socketInfo: ISocketInfo) => socketInfo.socket === socket,
    )!;
  }

  public getReplicas(): ISocketInfo[] {
    return this.sockets.filter(
      (socketInfo: ISocketInfo) => socketInfo.isReplica,
    );
  }
}

const socketsInfo: SocketsInfo = new SocketsInfo();
export { socketsInfo };
