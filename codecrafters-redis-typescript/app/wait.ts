import type { ISocketInfo } from "./model";
import { redisProtocolEncoder } from "./redisProtocolEncoder";
import { Response } from "./response";
import { socketsInfo } from "./socketsInfo";
import * as net from "net";

export class Wait {
  private static askForACKInterval: Timer;
  private static resolveWaitTimeout: Timer;
  private static checkIfWaitResolvedInterval: Timer;

  public static exe(socket: net.Socket, command: string[]): void {
    const numOfAckReplicasNeeded: number = Number.parseInt(command[1]);
    const expireTime: number = Number.parseInt(command[2]);

    this.startResolveWaitTimer(socket, expireTime);
    this.askForACK();
    this.checkIfWaitResolved(socket, numOfAckReplicasNeeded);
  }

  private static askForACK(): void {
    this.askForACKInterval = setInterval(() => {
      socketsInfo.getReplicas().forEach((socketInfo: ISocketInfo) => {
        const respEncodedCommand: string = redisProtocolEncoder.encodeRespArr([
          "REPLCONF",
          "GETACK",
          "*",
        ]);
        Response.handle(socketInfo.socket, respEncodedCommand);
      });
    }, 20);
  }

  private static startResolveWaitTimer(
    socket: net.Socket,
    expireTime: number,
  ): void {
    this.resolveWaitTimeout = setTimeout(() => {
      this.clearTimers();

      const numOfAckReplicas: number = socketsInfo
        .getReplicas()
        .filter(
          (socketInfo) =>
            socketInfo.propagatedBytes === socketInfo.processedBytes ||
            socketInfo.processedBytes + 37 === socketInfo.propagatedBytes,
        ).length;

      Response.handle(socket, `:${numOfAckReplicas}\r\n`);
    }, expireTime);
  }

  private static checkIfWaitResolved(
    socket: net.Socket,
    numOfAckReplicasNeeded: number,
  ): void {
    this.checkIfWaitResolvedInterval = setInterval(() => {
      const numOfAckReplicas: number = socketsInfo
        .getReplicas()
        .filter(
          (socketInfo) =>
            socketInfo.propagatedBytes === socketInfo.processedBytes ||
            socketInfo.processedBytes + 37 === socketInfo.propagatedBytes,
        ).length;

      if (numOfAckReplicas >= numOfAckReplicasNeeded) {
        this.clearTimers();
        Response.handle(socket, `:${numOfAckReplicas}\r\n`);
      }
    }, 10);
  }

  private static clearTimers(): void {
    clearInterval(this.checkIfWaitResolvedInterval);
    clearInterval(this.askForACKInterval);
    clearTimeout(this.resolveWaitTimeout);
  }
}
