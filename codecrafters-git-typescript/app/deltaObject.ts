import { InstructionParser } from "./instructionParser";
import type { ObjectType } from "./model";

export class DeltaObject {
  constructor(
    public ref: Buffer,
    public refHex: string,
    public instructions: Buffer,
    public type: ObjectType
  ) {}

  public static create(
    objectContent: Buffer,
    objectType: ObjectType,
    deltaRef: Buffer
  ): DeltaObject {
    return new DeltaObject(
      deltaRef,
      deltaRef.toString("hex"),
      objectContent,
      objectType
    );
  }
  public static applyDeltaInstructions(
    instructions: Buffer,
    referencedObjectContent: Buffer
  ): Buffer {
    let appliedDeltaContent: Buffer = Buffer.alloc(0);
    let i: number = 0;

    const {
      parsedBytes: referencedGitObjectParsedBytes,
    }: { parsedBytes: number } = InstructionParser.parseSize(instructions, i);
    i += referencedGitObjectParsedBytes;

    const { parsedBytes: targetGitObjectParsedBytes }: { parsedBytes: number } =
      InstructionParser.parseSize(instructions, i);
    i += targetGitObjectParsedBytes;

    while (i < instructions.length) {
      // Copy instruction
      if (instructions[i] & 0x80) {
        const {
          offset,
          size,
          parsedBytes,
        }: { offset: number; size: number; parsedBytes: number } =
          InstructionParser.parseCopy(instructions, i);
        const copyContent: Uint8Array = new Uint8Array(
          referencedObjectContent.subarray(offset, offset + size)
        );
        appliedDeltaContent = Buffer.concat([
          new Uint8Array(appliedDeltaContent),
          copyContent,
        ]);
        i += parsedBytes;
      }

      // Insert instruction
      else {
        const {
          insertContent,
          parsedBytes,
        }: { parsedBytes: number; insertContent: Buffer } =
          InstructionParser.parseInsert(instructions, i);

        appliedDeltaContent = Buffer.concat([
          new Uint8Array(appliedDeltaContent),
          new Uint8Array(insertContent),
        ]);

        i += parsedBytes;
      }
    }

    return appliedDeltaContent;
  }
}
