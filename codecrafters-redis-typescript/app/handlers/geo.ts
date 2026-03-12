import * as net from "net";
import { Response } from "../response";
import { redisProtocolEncoder } from "../protocol/redisProtocolEncoder";
import { set } from "./set";
import { Coordinates, type SetMember } from "../models/model";

class Geo {
  private readonly MIN_LATITUDE = -85.05112878;
  private readonly MAX_LATITUDE = 85.05112878;
  private readonly MIN_LONGITUDE = -180;
  private readonly MAX_LONGITUDE = 180;

  private readonly LATITUDE_RANGE = this.MAX_LATITUDE - this.MIN_LATITUDE;
  private readonly LONGITUDE_RANGE = this.MAX_LONGITUDE - this.MIN_LONGITUDE;

  public geoAdd(socket: net.Socket, command: string[]) {
    const setName: string = command[1];
    const longitude: number = Number.parseFloat(command[2]);
    const latitude: number = Number.parseFloat(command[3]);
    const setMemberName: string = command[4];

    if (!this.longitudeAndLatitudeValid(longitude, latitude)) {
      Response.handle(
        socket,
        redisProtocolEncoder.encodeSimpleError(
          `ERR invalid longitude,latitude pair ${longitude},${latitude}`,
        ),
      );
      return;
    }

    const score: bigint = this.encodeLatitudeAndLongitude(longitude, latitude);

    set.zAdd(socket, ["zAdd", setName, `${score}`, setMemberName]);
  }

  public geoPos(socket: net.Socket, command: string[]): void {
    const setName: string = command[1];
    const setMembersNames: string[] = command.slice(2);
    const activeSet: SetMember[] = set.getSet(setName);

    const coordinates: (string[] | null)[] = setMembersNames.map(
      (setMemberName: string) => this.getPosition(activeSet, setMemberName),
    );

    if (
      coordinates.some((coordinate: string[] | null) => coordinate !== null)
    ) {
      Response.handle(socket, redisProtocolEncoder.encodeRespArr(coordinates));
    } else {
      Response.handle(
        socket,
        redisProtocolEncoder.encodeRespArr(
          new Array(coordinates.length).fill(null),
        ),
      );
    }
  }

  public geoDist(socket: net.Socket, command: string[]): void {
    const setName: string = command[1];
    const setMember1: string = command[2];
    const setMember2: string = command[3];
    const activeSet: SetMember[] = set.getSet(setName);

    const distance: string = this.getDistance(
      activeSet,
      setMember1,
      setMember2,
    );

    if (distance) {
      Response.handle(socket, redisProtocolEncoder.encodeBulkString(distance));
    }
  }

  public geoSearch(socket: net.Socket, command: string[]): void {
    const setName: string = command[1];
    const longitude: string = command[3];
    const latitude: string = command[4];
    const radius: string = command[6];
    const activeSet: SetMember[] = set.getSet(setName);

    const matchingSetMembers: string[] = activeSet
      .filter((setMember: SetMember) => {
        const coordinates: string[] = this.decodeLatitudeAndLongitude(
          setMember.score,
        );
        if (
          this.longitudeAndLatitudeValid(
            Number.parseFloat(coordinates[Coordinates.Longitude]),
            Number.parseFloat(coordinates[Coordinates.Latitude]),
          )
        ) {
          const distance: number = this.haversine(
            Number.parseFloat(coordinates[Coordinates.Longitude]),
            Number.parseFloat(coordinates[Coordinates.Latitude]),
            Number.parseFloat(longitude),
            Number.parseFloat(latitude),
          );

          return distance <= Number.parseFloat(radius);
        }
      })
      .map((setMember: SetMember) => setMember.name);

    Response.handle(
      socket,
      redisProtocolEncoder.encodeRespArr(matchingSetMembers),
    );
  }

  private getDistance(
    activeSet: SetMember[],
    setMember1: string,
    setMember2: string,
  ): string {
    const coordinates1: string[] | null = this.getPosition(
      activeSet,
      setMember1,
    );
    const coordinates2: string[] | null = this.getPosition(
      activeSet,
      setMember2,
    );

    if (Array.isArray(coordinates1) && Array.isArray(coordinates2)) {
      return this.haversine(
        Number.parseFloat(coordinates1[Coordinates.Longitude]),
        Number.parseFloat(coordinates1[Coordinates.Latitude]),
        Number.parseFloat(coordinates2[Coordinates.Longitude]),
        Number.parseFloat(coordinates2[Coordinates.Latitude]),
      ).toString();
    } else {
      return "";
    }
  }

  private getPosition(
    activeSet: SetMember[],
    setMemberName: string,
  ): string[] | null {
    const setMember: SetMember | undefined = set.findSetMember(
      activeSet,
      setMemberName,
    );

    return setMember?.score
      ? this.decodeLatitudeAndLongitude(setMember.score)
      : null;
  }

  private longitudeAndLatitudeValid(
    longitude: number,
    latitude: number,
  ): boolean {
    if (longitude > this.MAX_LONGITUDE || longitude < this.MIN_LONGITUDE) {
      return false;
    }

    if (latitude > this.MAX_LATITUDE || latitude < this.MIN_LATITUDE) {
      return false;
    }

    return true;
  }

  private encodeLatitudeAndLongitude(
    longitude: number,
    latitude: number,
  ): bigint {
    const normalizedLatitude: number = Math.floor(
      ((latitude - this.MIN_LATITUDE) / this.LATITUDE_RANGE) * 2 ** 26,
    );
    const normalizedLongitude: number = Math.floor(
      ((longitude - this.MIN_LONGITUDE) / this.LONGITUDE_RANGE) * 2 ** 26,
    );

    const spreadInt32ToInt64: (int32: number) => bigint = (
      int32: number,
    ): bigint => {
      let int64: bigint = BigInt(int32 >>> 0);

      int64 = (int64 | (int64 << 16n)) & 0x0000ffff0000ffffn;
      int64 = (int64 | (int64 << 8n)) & 0x00ff00ff00ff00ffn;
      int64 = (int64 | (int64 << 4n)) & 0x0f0f0f0f0f0f0f0fn;
      int64 = (int64 | (int64 << 2n)) & 0x3333333333333333n;
      int64 = (int64 | (int64 << 1n)) & 0x5555555555555555n;

      return int64;
    };

    const x: bigint = spreadInt32ToInt64(normalizedLatitude);
    const yShifted: bigint = spreadInt32ToInt64(normalizedLongitude) << 1n;

    return x | yShifted;
  }

  private decodeLatitudeAndLongitude(geoScore: string): string[] {
    const x: bigint = BigInt(geoScore);
    const yShifted: bigint = BigInt(geoScore) >> 1n;

    const compact_int64_to_int32: (int64: bigint) => number = (
      int64: bigint,
    ): number => {
      let int32: bigint = int64 & 0x5555555555555555n;

      int32 = (int32 | (int32 >> 1n)) & 0x3333333333333333n;
      int32 = (int32 | (int32 >> 2n)) & 0x0f0f0f0f0f0f0f0fn;
      int32 = (int32 | (int32 >> 4n)) & 0x00ff00ff00ff00ffn;
      int32 = (int32 | (int32 >> 8n)) & 0x0000ffff0000ffffn;
      int32 = (int32 | (int32 >> 16n)) & 0x00000000ffffffffn;

      return Number(int32);
    };

    const normalizedLatitude: number = compact_int64_to_int32(x);
    const normalizedLongitude: number = compact_int64_to_int32(yShifted);

    const latitude: number =
      this.MIN_LATITUDE +
      this.LATITUDE_RANGE * ((normalizedLatitude + 0.5) / 2 ** 26);
    const longitude: number =
      this.MIN_LONGITUDE +
      this.LONGITUDE_RANGE * ((normalizedLongitude + 0.5) / 2 ** 26);

    return [longitude.toString(), latitude.toString()];
  }

  private radians(degree: number): number {
    return (degree * Math.PI) / 180;
  }

  private haversine(
    longitude1: number,
    latitude1: number,
    longitude2: number,
    latitude2: number,
  ): number {
    const R: number = 6372.797560856; // km
    const deltaLat: number = this.radians(latitude2 - latitude1);
    const deltaLon: number = this.radians(longitude2 - longitude1);

    latitude1 = this.radians(latitude1);
    latitude2 = this.radians(latitude2);

    const a: number =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.sin(deltaLon / 2) *
        Math.sin(deltaLon / 2) *
        Math.cos(latitude1) *
        Math.cos(latitude2);
    const c: number = 2 * Math.asin(Math.sqrt(a));

    return R * c * 1000;
  }
}

const geo: Geo = new Geo();
export { geo };
