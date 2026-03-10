import * as net from "net";
import type { SetMember } from "../models/model";
import { Response } from "../response";
import { redisProtocolEncoder } from "../protocol/redisProtocolEncoder";

class Set {
  private setDictionary: { [setName: string]: SetMember[] } = {};

  public zAdd(socket: net.Socket, command: string[]): void {
    const setName: string = command[1];
    const setMemberScore: number = Number.parseFloat(command[2]);
    const setMemberName: string = command[3];

    const set: SetMember[] = (this.setDictionary[setName] ??= []);
    const setMember: SetMember | undefined = this.findSetMember(
      set,
      setMemberName,
    );

    if (setMember) {
      this.updateSetMember(set, setMember, setMemberScore);
      Response.handle(socket, redisProtocolEncoder.encodeNumber("0"));
    } else {
      this.addSetMember(set, { name: setMemberName, score: setMemberScore });
      Response.handle(socket, redisProtocolEncoder.encodeNumber("1"));
    }
  }

  public zRank(socket: net.Socket, command: string[]): void {
    const setName: string = command[1];
    const setMemberName: string = command[2];

    const set: SetMember[] | undefined = this.setDictionary[setName];
    const setMember: SetMember | undefined = this.findSetMember(
      set || [],
      setMemberName,
    );

    if (set && setMember) {
      Response.handle(
        socket,
        redisProtocolEncoder.encodeNumber(
          `${this.getSetMemberRank(set, setMember)}`,
        ),
      );
    } else {
      Response.handle(socket, redisProtocolEncoder.encodeNullBulkString());
    }
  }

  public zRange(socket: net.Socket, command: string[]): void {
    const setName: string = command[1];
    const lowBoundary: number = Number.parseInt(command[2]);
    const highBoundary: number = Number.parseInt(command[3]);

    const set: SetMember[] = this.setDictionary[setName] || [];

    Response.handle(
      socket,
      redisProtocolEncoder.encodeRespArr(
        set
          .slice(lowBoundary, highBoundary + 1 || set.length)
          .map((setMember: SetMember) => setMember.name),
      ),
    );
  }

  public zCard(socket: net.Socket, command: string[]): void {
    const setName: string = command[1];
    const set: SetMember[] = this.setDictionary[setName] || [];

    Response.handle(socket, redisProtocolEncoder.encodeNumber(`${set.length}`));
  }

  private getSetMemberRank(set: SetMember[], setMember: SetMember): number {
    return set.indexOf(setMember);
  }

  private addSetMember(set: SetMember[], setMember: SetMember): void {
    set.push({ name: setMember.name, score: setMember.score });
    this.sortSet(set);
  }

  private updateSetMember(
    set: SetMember[],
    setMember: SetMember,
    newSetMemberScore: number,
  ): void {
    setMember.score = newSetMemberScore;
    this.sortSet(set);
  }

  private sortSet(set: SetMember[]): void {
    set.sort(
      (a: SetMember, b: SetMember) =>
        a.score - b.score || a.name.localeCompare(b.name),
    );
  }

  private findSetMember(
    set: SetMember[],
    setMemberName: string,
  ): SetMember | undefined {
    return set.find((setMember: SetMember) => setMember.name === setMemberName);
  }
}

const set = new Set();
export { set };
