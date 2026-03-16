import * as net from "net";
import { ExecutionType, type SocketInfo } from "../models/model";
import { Subject } from "rxjs";
import { socketsInfo } from "../socketsInfo";
import { redisProtocolEncoder } from "../protocol/redisProtocolEncoder";
import { Response } from "../response";

export class ChannelHandler {
  private channels: Record<string, Subject<string>> = {};
  private readonly subscribedModeCmds: string[] = [
    "subscribe",
    "unsubscribe",
    "psubscribe",
    "punsubscribe",
    "ping",
    "quit",
  ];

  public subscribe(socket: net.Socket, command: string[]): void {
    const channelName: string = command[1];
    const channel: Subject<string> | undefined = this.channels[channelName];

    if (channel) {
      if (!socketsInfo.getInfo(socket).subscriptions[channelName]) {
        this.subscribeToTheChannel(socket, channelName);
      }
    } else {
      const channel: Subject<string> = new Subject();
      this.channels[channelName] = channel;
      this.subscribeToTheChannel(socket, channelName);
    }

    socketsInfo.getInfo(socket).executionType = ExecutionType.Subscribe;

    Response.handle(
      socket,
      redisProtocolEncoder.encodeRespArr([
        "subscribe",
        `${channelName}`,
        Object.keys(socketsInfo.getInfo(socket).subscriptions).length,
      ]),
    );
  }

  public unsubscribe(socket: net.Socket, command: string[]): void {
    const channelName: string = command[1];

    socketsInfo.getInfo(socket).subscriptions[channelName]?.unsubscribe();
    delete socketsInfo.getInfo(socket).subscriptions[channelName];

    const numberOfSubscribers: number = socketsInfo.sockets.filter(
      (socketInfo: SocketInfo) => socketInfo.subscriptions[channelName],
    ).length;

    Response.handle(
      socket,
      redisProtocolEncoder.encodeRespArr([
        "unsubscribe",
        `${channelName}`,
        numberOfSubscribers,
      ]),
    );
  }

  public publish(socket: net.Socket, command: string[]): void {
    const channelName: string = command[1];
    const message: string = command[2];

    this.channels[channelName]?.next(message);

    Response.handle(
      socket,
      redisProtocolEncoder.encodeNumber(
        `${
          socketsInfo.sockets.filter(
            (socketInfo: SocketInfo) => socketInfo.subscriptions[channelName],
          ).length
        }`,
      ),
    );
  }

  private subscribeToTheChannel(socket: net.Socket, channelName: string): void {
    socketsInfo.getInfo(socket).subscriptions[channelName] = this.channels[
      channelName
    ].subscribe({
      next: (message: string) => {
        Response.handle(
          socket,
          redisProtocolEncoder.encodeRespArr(["message", channelName, message]),
        );
      },
    });
  }

  public isNonSubscribeCmdInSubscribeMode(
    socket: net.Socket,
    command: string[],
  ): boolean {
    if (socketsInfo.getInfo(socket).executionType === ExecutionType.Subscribe) {
      if (!this.subscribedModeCmds.includes(command[0].toLowerCase())) {
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }
}

const channelHandler = new ChannelHandler();
export { channelHandler };
