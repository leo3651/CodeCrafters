import { CELL_POINTER_SIZE } from "./constants";
import { DBFileReader } from "./dbFileReader";
import { Headers } from "./headers";
import type { IBTreePageHeader } from "./models";

export class CellPointers {
  private static _cellPointersArr: { [key: string]: number[] } = {};

  public static async getCellPointersForPageAtOffset(
    pageHeaderOffset: number,
  ): Promise<number[]> {
    if (this._cellPointersArr[pageHeaderOffset]) {
      return this._cellPointersArr[pageHeaderOffset];
    } else {
      this._cellPointersArr[pageHeaderOffset] =
        await this.getCellPointerArray(pageHeaderOffset);
      return this._cellPointersArr[pageHeaderOffset];
    }
  }

  private static async getCellPointerArray(
    pageHeaderOffset: number,
  ): Promise<number[]> {
    const {
      "number of cells": numberOfCells,
      BTreePageHeaderSize,
    }: IBTreePageHeader = await Headers.getPageHeaderAtOffset(pageHeaderOffset);
    const cellPointerArr: number[] = [];

    const cellPointerBuffer: Uint8Array = await DBFileReader.readNBytesAtOffset(
      numberOfCells * CELL_POINTER_SIZE,
      pageHeaderOffset + BTreePageHeaderSize,
    );

    for (let i = 0; i < numberOfCells; i++) {
      cellPointerArr.push(
        new DataView(
          cellPointerBuffer.buffer,
          0,
          cellPointerBuffer.length,
        ).getUint16(i * CELL_POINTER_SIZE),
      );
    }

    return cellPointerArr;
  }
}
