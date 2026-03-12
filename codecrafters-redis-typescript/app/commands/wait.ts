import * as net from "net";
import { socketsInfo } from "../socketsInfo";
import type { SocketInfo } from "../models/model";
import { redisProtocolEncoder } from "../protocol/redisProtocolEncoder";
import { Response } from "../response";

export class Wait {
  private static askForACKInterval: Timer;
  private static resolveWaitTimeout: Timer;
  private static checkIfWaitResolvedInterval: Timer;

  public static exe(socket: net.Socket, command: string[]): void {
    const numberOfAckReplicasNeeded: number = Number.parseInt(command[1]);
    const expireTime: number = Number.parseInt(command[2]);

    this.startResolveWaitTimer(socket, expireTime);
    this.askForACK();
    this.checkIfWaitResolved(socket, numberOfAckReplicasNeeded);
  }

  private static askForACK(): void {
    this.askForACKInterval = setInterval(() => {
      socketsInfo.getReplicas().forEach((socketInfo: SocketInfo) => {
        const getAckCommand: string = redisProtocolEncoder.encodeRespArr([
          "REPLCONF",
          "GETACK",
          "*",
        ]);
        Response.handle(socketInfo.socket, getAckCommand);
      });
    }, 20);
  }

  private static startResolveWaitTimer(
    socket: net.Socket,
    expireTime: number,
  ): void {
    this.resolveWaitTimeout = setTimeout(() => {
      this.clearTimers();

      const numberOfAckReplicas: number = socketsInfo
        .getReplicas()
        .filter(
          (socketInfo) =>
            socketInfo.propagatedBytes === socketInfo.processedBytes ||
            socketInfo.processedBytes + 37 === socketInfo.propagatedBytes,
        ).length;

      Response.handle(socket, `:${numberOfAckReplicas}\r\n`);
    }, expireTime);
  }

  private static checkIfWaitResolved(
    socket: net.Socket,
    numberOfAckReplicasNeeded: number,
  ): void {
    this.checkIfWaitResolvedInterval = setInterval(() => {
      const numberOfAckReplicas: number = socketsInfo
        .getReplicas()
        .filter(
          (socketInfo) =>
            socketInfo.propagatedBytes === socketInfo.processedBytes ||
            socketInfo.processedBytes + 37 === socketInfo.propagatedBytes,
        ).length;

      if (numberOfAckReplicas >= numberOfAckReplicasNeeded) {
        this.clearTimers();
        Response.handle(socket, `:${numberOfAckReplicas}\r\n`);
      }
    }, 10);
  }

  private static clearTimers(): void {
    clearInterval(this.checkIfWaitResolvedInterval);
    clearInterval(this.askForACKInterval);
    clearTimeout(this.resolveWaitTimeout);
  }
}
