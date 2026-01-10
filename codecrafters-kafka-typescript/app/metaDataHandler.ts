import {
  EByteSize,
  EMetadataRecordType,
  type RecordHeader,
  type Variant,
} from "./model";
import fs from "fs";
import {
  buildBuffer,
  crc32c,
  readVariant,
  writeUnsignedVariant,
} from "./utils";

export class KafkaClusterMetadataLogFile {
  constructor(public batches: KafkaRecordBatch[]) {}

  public static fromFile(filePath: string): KafkaClusterMetadataLogFile {
    // Handle file not found error
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const data: Buffer = fs.readFileSync(filePath);
    console.log(`Reading file: ${filePath} with size: ${data.length}`);

    return KafkaClusterMetadataLogFile.fromBuffer(data);
  }

  public static fromBuffer(buffer: Buffer): KafkaClusterMetadataLogFile {
    let currentOffset: number = 0;
    const recordBatches: KafkaRecordBatch[] = [];

    while (currentOffset < buffer.length) {
      // Start reading first record batch
      const recordBatch: KafkaRecordBatch = KafkaRecordBatch.fromBuffer(
        buffer.subarray(currentOffset)
      );

      currentOffset += recordBatch.bufferSize();
      recordBatches.push(recordBatch);
    }

    const logFile: KafkaClusterMetadataLogFile =
      new KafkaClusterMetadataLogFile(recordBatches);

    return logFile;
  }

  public getTopics(): KafkaTopic[] {
    const topics: KafkaTopic[] = this.batches
      .map((batch: KafkaRecordBatch) => batch.getTopic())
      .filter((record: KafkaTopic) => record !== null && record !== undefined);

    return topics;
  }

  public getMatchTopic(topicUUID: Buffer): KafkaTopic | undefined {
    const topics: KafkaTopic[] = this.getTopics();

    const topic: KafkaTopic | undefined = topics.find((record) =>
      record.uuid.equals(topicUUID)
    );

    return topic;
  }

  public getPartitionsMatchTopicUuid(topicUuid: Buffer): KafkaPartition[] {
    const partitions: KafkaPartition[] = this.batches
      .map((batch: KafkaRecordBatch) => batch.getPartitions())
      .flat()
      .filter((record: KafkaPartition) => record.topicUuid.equals(topicUuid));

    return partitions;
  }
}

export class KafkaRecordBatch {
  constructor(
    public baseOffset: bigint,
    public batchLength: number,
    public partitionLeaderEpoch: number,
    public magicByte: number,
    public crc: number,
    public attributes: number,
    public lastOffsetDelta: number,
    public baseTimestamp: bigint,
    public maxTimestamp: bigint,
    public producerId: bigint,
    public producerEpoch: number,
    public baseSequence: number,
    public recordCount: number,
    public records: KafkaRecord[]
  ) {}

  public bufferSize(): number {
    return (
      8 + // baseOffset size itself
      4 + // batchLength size itself
      this.batchLength
    );
  }

  public static fromBuffer(buffer: Buffer): KafkaRecordBatch {
    let currentOffset: number = 0;

    const baseOffset: bigint = buffer.readBigInt64BE(currentOffset);
    currentOffset += 8;

    const batchLength: number = buffer.readInt32BE(currentOffset);
    currentOffset += 4;

    const partitionLeaderEpoch: number = buffer.readInt32BE(currentOffset);
    currentOffset += 4;

    const magicByte: number = buffer.readInt8(currentOffset);
    currentOffset += 1;

    const crc: number = buffer.readUInt32BE(currentOffset);
    currentOffset += 4;

    const attributes: number = buffer.readInt16BE(currentOffset);
    currentOffset += 2;

    const lastOffsetDelta: number = buffer.readInt32BE(currentOffset);
    currentOffset += 4;

    const baseTimestamp: bigint = buffer.readBigInt64BE(currentOffset);
    currentOffset += 8;

    const maxTimestamp: bigint = buffer.readBigInt64BE(currentOffset);
    currentOffset += 8;

    const producerId: bigint = buffer.readBigInt64BE(currentOffset);
    currentOffset += 8;

    const producerEpoch: number = buffer.readInt16BE(currentOffset);
    currentOffset += 2;

    const baseSequence: number = buffer.readInt32BE(currentOffset);
    currentOffset += 4;

    const recordCount: number = buffer.readUInt32BE(currentOffset);
    currentOffset += 4;

    // Read the record batch items
    const records: KafkaRecord[] = [];

    for (let i = 0; i < recordCount; i++) {
      const { value: recordLength, length: recordLengthSize }: Variant =
        readVariant(buffer.subarray(currentOffset), true);
      currentOffset += recordLengthSize;

      const attributes: number = buffer.readUInt8(currentOffset);
      currentOffset += 1;

      const timestampDelta: number = buffer.readInt8(currentOffset);
      currentOffset += 1;

      const offsetDelta: number = buffer.readInt8(currentOffset);
      currentOffset += 1;

      const { value: keyLength, length: keyLengthSize }: Variant = readVariant(
        buffer.subarray(currentOffset),
        true
      );
      currentOffset += keyLengthSize;

      let keyValue: Buffer | null = null;
      if (keyLength !== -1) {
        keyValue = buffer.subarray(currentOffset, currentOffset + keyLength);
        currentOffset += keyLength;
      }

      const {
        value: recordValueLength,
        length: recordValueLengthSize,
      }: Variant = readVariant(buffer.subarray(currentOffset), true);
      currentOffset += recordValueLengthSize;

      const recordValue: Buffer = buffer.subarray(
        currentOffset,
        currentOffset + recordValueLength
      );

      const recordType: number = recordValue.readInt8(1);

      let valueRecord:
        | KafkaTopic
        | KafkaPartition
        | KafkaFeatureLevel
        | Buffer
        | null = null;

      switch (recordType) {
        case EMetadataRecordType.FEATURE_LEVEL:
          valueRecord = KafkaFeatureLevel.fromBuffer(recordValue);
          break;
        case EMetadataRecordType.TOPIC:
          valueRecord = KafkaTopic.fromBuffer(recordValue);
          break;
        case EMetadataRecordType.PARTITION:
          valueRecord = KafkaPartition.fromBuffer(recordValue);
          break;
        default:
          valueRecord = Buffer.from(recordValue);
          console.log(`Record ${i}: UNKNOWN record type: ${recordType}`);
          break;
      }

      currentOffset += recordValueLength;

      const { value: headersLength, length: headerLengthBufSize }: Variant =
        readVariant(buffer.subarray(currentOffset), true);
      currentOffset += headerLengthBufSize;

      const headers: RecordHeader[] = [];
      for (let i = 0; i < headersLength; i++) {
        const { value: hKeyLen, length: hKeyBufSize }: Variant = readVariant(
          buffer.subarray(currentOffset),
          true
        );
        currentOffset += hKeyBufSize;
        let hKey: Buffer | null = null;
        if (hKeyLen > 0) {
          hKey = buffer.subarray(currentOffset + hKeyLen);
          currentOffset += hKeyLen;
        }

        const { value: hKeyValLen, length: hKeyValBufSize }: Variant =
          readVariant(buffer.subarray(currentOffset), true);
        currentOffset += hKeyValBufSize;
        let hKeyVal: Buffer | null = null;
        if (hKeyValLen > 0) {
          hKeyVal = buffer.subarray(currentOffset, currentOffset + hKeyValLen);
          currentOffset += hKeyValLen;
        }

        const header: RecordHeader = { hKeyLen, hKey, hKeyValLen, hKeyVal };
        headers.push(header);
      }

      records.push(
        new KafkaRecord(
          recordLength,
          attributes,
          timestampDelta,
          offsetDelta,
          keyLength,
          keyValue,
          recordValueLength,
          valueRecord,
          headersLength,
          headers
        )
      );
    }

    const recordBatch: KafkaRecordBatch = new KafkaRecordBatch(
      baseOffset,
      batchLength,
      partitionLeaderEpoch,
      magicByte,
      crc,
      attributes,
      lastOffsetDelta,
      baseTimestamp,
      maxTimestamp,
      producerId,
      producerEpoch,
      baseSequence,
      recordCount,
      records
    );

    return recordBatch;
  }

  public static buildRecordBatchBuffer(recordBatch: KafkaRecordBatch): Buffer {
    const baseOffsetBuffer: Buffer = buildBuffer(
      EByteSize.writeBigUInt64BE,
      recordBatch.baseOffset
    );
    const batchLengthBuffer: Buffer = buildBuffer(
      EByteSize.writeUInt32BE,
      recordBatch.batchLength
    );
    const partitionLeaderEpochBuffer: Buffer = buildBuffer(
      EByteSize.writeUInt32BE,
      recordBatch.partitionLeaderEpoch
    );
    const magicByteBuffer: Buffer = buildBuffer(
      EByteSize.writeUInt8,
      recordBatch.magicByte
    );
    const crcBuffer: Buffer = buildBuffer(
      EByteSize.writeUInt32BE,
      recordBatch.crc
    );
    const attributesBuffer: Buffer = buildBuffer(
      EByteSize.writeUInt16BE,
      recordBatch.attributes
    );
    const lastOffsetDeltaBuffer: Buffer = buildBuffer(
      EByteSize.writeUInt32BE,
      recordBatch.lastOffsetDelta
    );
    const baseTimestampBuffer: Buffer = buildBuffer(
      EByteSize.writeBigUInt64BE,
      recordBatch.baseTimestamp
    );
    const maxTimestampBuffer: Buffer = buildBuffer(
      EByteSize.writeBigUInt64BE,
      recordBatch.maxTimestamp
    );
    const producerIdBuffer: Buffer = buildBuffer(
      EByteSize.writeBigUInt64BE,
      recordBatch.producerId
    );
    const producerEpochBuffer: Buffer = buildBuffer(
      EByteSize.writeUInt16BE,
      recordBatch.producerEpoch
    );
    const baseSequenceBuffer: Buffer = buildBuffer(
      EByteSize.writeUInt32BE,
      recordBatch.baseSequence
    );
    const recordCountBuffer: Buffer = buildBuffer(
      EByteSize.writeUInt32BE,
      recordBatch.recordCount
    );
    const arrOfRecordsBuffer: Buffer[] = recordBatch.records.map(
      (record: KafkaRecord) => KafkaRecord.buildRecordBuffer(record)
    );

    const buffer = Buffer.concat([
      baseOffsetBuffer,
      batchLengthBuffer,
      partitionLeaderEpochBuffer,
      magicByteBuffer,
      crcBuffer,
      attributesBuffer,
      lastOffsetDeltaBuffer,
      baseTimestampBuffer,
      maxTimestampBuffer,
      producerIdBuffer,
      producerEpochBuffer,
      baseSequenceBuffer,
      recordCountBuffer,
      ...arrOfRecordsBuffer,
    ]);

    // Update batch length
    baseOffsetBuffer.writeUInt32BE(buffer.length - 12);

    // Update crc
    const crcEndOffset: number = 17 + 4; // crc start offset + size
    const correctCrc: number = crc32c(buffer.subarray(crcEndOffset));
    crcBuffer.writeUInt32BE(correctCrc);

    return buffer;
  }

  public getTopic(): KafkaTopic {
    const topic: KafkaTopic = this.records.find(
      (item: KafkaRecord) => item.value instanceof KafkaTopic
    )?.value as KafkaTopic;

    return topic;
  }

  public getPartitions(): KafkaPartition[] {
    const partitions: KafkaPartition[] = this.records
      .filter((item: KafkaRecord) => item.value instanceof KafkaPartition)
      .map((item) => item.value as KafkaPartition);

    return partitions;
  }
}

export class KafkaRecord {
  constructor(
    public length: number,
    public attributes: number,
    public timestampDelta: number,
    public offsetDelta: number,
    public keyLength: number,
    public keyValue: Buffer | null,
    public valueLength: number,
    public value:
      | KafkaTopic
      | KafkaPartition
      | KafkaFeatureLevel
      | Buffer
      | null,
    public headersLength: number,
    public headers: RecordHeader[]
  ) {}

  public static buildRecordBuffer(recordBatchItem: KafkaRecord): Buffer {
    const lengthBuffer: Buffer = writeUnsignedVariant(
      recordBatchItem.length,
      true
    );
    const attributesBuffer: Buffer = buildBuffer(
      EByteSize.writeUInt8,
      recordBatchItem.attributes
    );
    const timestampDeltaBuffer: Buffer = writeUnsignedVariant(
      recordBatchItem.timestampDelta,
      true
    );
    const offsetDeltaBuffer: Buffer = writeUnsignedVariant(
      recordBatchItem.offsetDelta,
      true
    );

    const keyLenBuffer: Buffer = writeUnsignedVariant(
      recordBatchItem.keyLength,
      true
    );
    const keyValBuffer: Buffer = recordBatchItem.keyValue || Buffer.alloc(0);

    const valueLengthBuffer: Buffer = writeUnsignedVariant(
      recordBatchItem.valueLength,
      true
    );
    const valueBuffer: Buffer =
      recordBatchItem.value instanceof Buffer
        ? recordBatchItem.value
        : Buffer.alloc(0);

    const headerLengthBuffer: Buffer = writeUnsignedVariant(
      recordBatchItem.headersLength,
      true
    );
    let headersBuffer: Buffer = Buffer.alloc(0);

    if (recordBatchItem.headersLength > 0) {
      for (let i = 0; i < recordBatchItem.headersLength; i++) {
        const hKeyLenBuf: Buffer = writeUnsignedVariant(
          recordBatchItem.headers[i].hKeyLen,
          true
        );
        const hKey: Buffer = recordBatchItem.headers[i].hKey || Buffer.alloc(0);

        const hKeyValLenBuf: Buffer = writeUnsignedVariant(
          recordBatchItem.headers[i].hKeyValLen,
          true
        );
        const hKeyVal: Buffer =
          recordBatchItem.headers[i].hKeyVal || Buffer.alloc(0);

        const header = Buffer.concat([
          hKeyLenBuf,
          hKey,
          hKeyValLenBuf,
          hKeyVal,
        ]);

        headersBuffer = Buffer.concat([headersBuffer, header]);
      }
    }

    return Buffer.concat([
      lengthBuffer,
      attributesBuffer,
      timestampDeltaBuffer,
      offsetDeltaBuffer,
      keyLenBuffer,
      keyValBuffer,
      valueLengthBuffer,
      valueBuffer,
      headerLengthBuffer,
      headersBuffer,
    ]);
  }
}

class KafkaFeatureLevel {
  constructor(
    public frameVersion: number,
    public type: number,
    public version: number,
    public nameLength: number,
    public name: string,
    public featureLevel: number,
    public tagFieldsCount: number
  ) {}

  public static fromBuffer(buffer: Buffer): KafkaFeatureLevel {
    let currentOffset: number = 0;

    const frameVersion: number = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    const type: number = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    const version: number = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    const nameLength: number = buffer.readUInt8(currentOffset) - 1;
    currentOffset += 1;

    const name: string = buffer
      .subarray(currentOffset, currentOffset + nameLength)
      .toString("utf-8");
    currentOffset += nameLength;

    const featureLevel: number = buffer.readUInt16BE(currentOffset);
    currentOffset += 2;

    const tagFieldsCount: number = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    return new KafkaFeatureLevel(
      frameVersion,
      type,
      version,
      nameLength,
      name,
      featureLevel,
      tagFieldsCount
    );
  }
}

export class KafkaTopic {
  constructor(
    public frameVersion: number,
    public type: number,
    public version: number,
    public nameLength: number,
    public name: string,
    public uuid: Buffer,
    public tagFieldsCount: number
  ) {}

  public static fromBuffer(buffer: Buffer): KafkaTopic {
    let currentOffset: number = 0;

    const frameVersion: number = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    const type: number = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    const version: number = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    const nameLength: number = buffer.readUInt8(currentOffset) - 1;
    currentOffset += 1;

    const name: string = buffer
      .subarray(currentOffset, currentOffset + nameLength)
      .toString("utf-8");
    currentOffset += nameLength;

    const uuid: Buffer = buffer.subarray(currentOffset, currentOffset + 16);
    currentOffset += 16;

    const tagFieldsCount: number = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    return new KafkaTopic(
      frameVersion,
      type,
      version,
      nameLength,
      name,
      uuid,
      tagFieldsCount
    );
  }
}

export class KafkaPartition {
  constructor(
    public frameVersion: number,
    public type: number,
    public version: number,
    public partitionId: number,
    public topicUuid: Buffer,
    public lengthOfReplicas: number,
    public replicas: number[],
    public lengthOfIsr: number,
    public isr: number[],
    public lengthOfRemovingReplicas: number,
    public removingReplicas: number[],
    public lengthOfAddingReplicas: number,
    public addingReplicas: number[],
    public leader: number,
    public leaderEpoch: number,
    public partitionEpoch: number,
    public lengthOfDirectory: number,
    public directory: Buffer,
    public tagFieldsCount: number
  ) {}

  public static fromBuffer(buffer: Buffer): KafkaPartition {
    let currentOffset: number = 0;

    const frameVersion: number = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    const type: number = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    const version: number = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    const partitionId: number = buffer.readUInt32BE(currentOffset);
    currentOffset += 4;

    const topicUuid: Buffer = buffer.subarray(
      currentOffset,
      currentOffset + 16
    );
    currentOffset += 16;

    const lengthOfReplicas: number = buffer.readUInt8(currentOffset) - 1;
    currentOffset += 1;
    const replicas: number[] = [];
    for (let i = 0; i < lengthOfReplicas; i++) {
      const replicaId: number = buffer.readUInt32BE(currentOffset);
      replicas.push(replicaId);
      currentOffset += 4;
    }

    currentOffset += lengthOfReplicas * 4;

    const lengthOfIsr: number = buffer.readUInt8(currentOffset) - 1;
    currentOffset += 1;
    const isr: number[] = [];
    for (let i = 0; i < lengthOfIsr; i++) {
      const isrId: number = buffer.readUInt32BE(currentOffset);
      isr.push(isrId);
      currentOffset += 4;
    }

    const lengthOfRemovingReplicas: number =
      buffer.readUInt8(currentOffset) - 1;
    currentOffset += 1;
    const removingReplicas: number[] = [];
    for (let i = 0; i < lengthOfRemovingReplicas; i++) {
      const removingReplicaId: number = buffer.readUInt32BE(currentOffset);
      removingReplicas.push(removingReplicaId);
      currentOffset += 4;
    }

    const lengthOfAddingReplicas: number = buffer.readUInt8(currentOffset) - 1;
    currentOffset += 1;
    const addingReplicas: number[] = [];
    for (let i = 0; i < lengthOfAddingReplicas; i++) {
      const addingReplicaId: number = buffer.readUInt32BE(currentOffset);
      addingReplicas.push(addingReplicaId);
      currentOffset += 4;
    }

    const leader: number = buffer.readUInt32BE(currentOffset);
    currentOffset += 4;

    const leaderEpoch: number = buffer.readUInt32BE(currentOffset);
    currentOffset += 4;

    const partitionEpoch: number = buffer.readUInt32BE(currentOffset);
    currentOffset += 4;

    const lengthOfDirectory: number = buffer.readUInt8(currentOffset) - 1;
    currentOffset += 1;
    const directory: Buffer = buffer.subarray(
      currentOffset,
      currentOffset + lengthOfDirectory * 16
    );
    currentOffset += lengthOfDirectory * 16;

    const tagFieldsCount: number = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    return new KafkaPartition(
      frameVersion,
      type,
      version,
      partitionId,
      topicUuid,
      lengthOfReplicas,
      replicas,
      lengthOfIsr,
      isr,
      lengthOfRemovingReplicas,
      removingReplicas,
      lengthOfAddingReplicas,
      addingReplicas,
      leader,
      leaderEpoch,
      partitionEpoch,
      lengthOfDirectory,
      directory,
      tagFieldsCount
    );
  }
}
