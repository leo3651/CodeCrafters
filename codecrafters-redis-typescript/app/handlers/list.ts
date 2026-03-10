import * as net from "net";

import { EAddType } from "../models/model";
import { Subject, take } from "rxjs";
import { socketsInfo } from "../socketsInfo";
import { redisProtocolEncoder } from "../protocol/redisProtocolEncoder";
import { Response } from "../response";

class List {
  private lists: { [key: string]: string[] } = {};
  private elementsAdded$: Subject<void> = new Subject();

  public blPop(socket: net.Socket, command: string[]): void {
    const listKey: string = command[1];
    const expiryTime: number = Number.parseFloat(command[2]);

    socketsInfo.getInfo(socket).listElAddedSubscription = this.elementsAdded$
      .pipe(take(1))
      .subscribe({
        next: () => {
          const removedEl: string | undefined = this.lists[listKey].shift();
          if (removedEl) {
            Response.handle(
              socket,
              redisProtocolEncoder.encodeRespArr([listKey, removedEl]),
            );
          }

          clearTimeout(socketsInfo.getInfo(socket).blockPopTimeout!);
        },
      });

    if (expiryTime) {
      socketsInfo.getInfo(socket).blockPopTimeout = setTimeout(() => {
        const removedEl: string | undefined = this.lists[listKey]?.shift();

        if (removedEl) {
          Response.handle(
            socket,
            redisProtocolEncoder.encodeRespArr([listKey, removedEl]),
          );
        } else {
          Response.handle(socket, redisProtocolEncoder.encodeNullArr());
        }

        socketsInfo.getInfo(socket).listElAddedSubscription?.unsubscribe();
      }, expiryTime * 1000);
    }
  }

  public lPop(socket: net.Socket, command: string[]): void {
    const listKey: string = command[1];
    const numOfElementsToPop: number = Number.parseInt(command[2]);

    const removedElements: string[] = this.lists[listKey].splice(
      0,
      numOfElementsToPop || 1,
    );

    Response.handle(
      socket,
      removedElements.length > 1
        ? redisProtocolEncoder.encodeRespArr(removedElements)
        : removedElements.length === 1
          ? redisProtocolEncoder.encodeBulkString(removedElements[0])
          : redisProtocolEncoder.encodeNullBulkString(),
    );
  }

  public lLen(socket: net.Socket, command: string[]): void {
    const listKey: string = command[1];
    const listLen: number = this.lists[listKey]?.length || 0;

    Response.handle(socket, redisProtocolEncoder.encodeNumber(`${listLen}`));
  }

  public rPush(socket: net.Socket, command: string[]): void {
    const list: string[] = this.addElements(command, EAddType.Append);

    Response.handle(
      socket,
      redisProtocolEncoder.encodeNumber(`${list.length}`),
    );

    this.elementsAdded$.next();
  }

  public lPush(socket: net.Socket, command: string[]): void {
    const list: string[] = this.addElements(command, EAddType.Prepend);

    Response.handle(
      socket,
      redisProtocolEncoder.encodeNumber(`${list.length}`),
    );

    this.elementsAdded$.next();
  }

  public lRange(socket: net.Socket, command: string[]): void {
    const listKey = command[1];
    const lowBoundary = Number.parseInt(command[2]);
    const highBoundary = Number.parseInt(command[3]);

    const list: string[] = (this.lists[listKey] ??= []);

    Response.handle(
      socket,
      redisProtocolEncoder.encodeRespArr(
        list.slice(lowBoundary, highBoundary + 1 || list.length),
      ),
    );
  }

  private addElements(command: string[], addType: EAddType): string[] {
    const listKey: string = command[1];
    const elements: string[] = command.slice(2);

    // Get or create the list
    const list: string[] = (this.lists[listKey] ??= []);

    if (addType === EAddType.Append) {
      list.push(...elements);
    } else {
      list.unshift(...elements.reverse());
    }

    return list;
  }
}

const list: List = new List();
export { list };
