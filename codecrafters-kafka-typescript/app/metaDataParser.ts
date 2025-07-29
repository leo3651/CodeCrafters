import { EMetadataRecordType } from "./model";
import { utils } from "./utils";
import fs from "fs";

export class KafkaClusterMetadataLogFile {
  constructor(public batches: KafkaClusterMetadataRecordBatch[]) {}

  public static fromFile(filePath: string): KafkaClusterMetadataLogFile {
    // Handle file not found error
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const data = fs.readFileSync(filePath);
    console.log(`Reading file: ${filePath} with size: ${data.length}`);

    return KafkaClusterMetadataLogFile.fromBuffer(data);
  }

  public static fromBuffer(buffer: Buffer): KafkaClusterMetadataLogFile {
    let currentOffset = 0;
    const batches: KafkaClusterMetadataRecordBatch[] = [];

    while (currentOffset < buffer.length) {
      // Start reading first record batch
      const batch = KafkaClusterMetadataRecordBatch.fromBuffer(
        buffer.subarray(currentOffset)
      );

      currentOffset += batch.bufferSize();
      batches.push(batch);
    }

    const logFile = new KafkaClusterMetadataLogFile(batches);

    return logFile;
  }

  getTopicRecords(): KafkaClusterMetadataTopicRecord[] {
    const topicRecords = this.batches
      .map((batch) => batch.getTopicRecord())
      .filter(
        (record) => record !== null && record !== undefined
      ) as KafkaClusterMetadataTopicRecord[];

    return topicRecords;
  }

  getMatchTopicRecord(
    topicUUID: Buffer
  ): KafkaClusterMetadataTopicRecord | undefined {
    const topicRecords = this.getTopicRecords();
    const topicRecord = topicRecords.find((record) =>
      record.uuid.equals(topicUUID)
    );

    return topicRecord;
  }

  getPartitionRecordsMatchTopicUuid(
    topicUuid: Buffer
  ): KafkaClusterMetadataPartitionRecord[] {
    const partitionRecords = this.batches
      .map((batch) => batch.getPartitionRecords())
      .flat()
      .filter((record) =>
        record.topicUuid.equals(topicUuid)
      ) as KafkaClusterMetadataPartitionRecord[];

    return partitionRecords;
  }
}

class KafkaClusterMetadataRecordBatch {
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
    public recordBatchItems: KafkaClusterMetadataRecordBatchItem[]
  ) {}

  public bufferSize(): number {
    return (
      8 + // baseOffset size itself
      4 + // batchLength size itself
      this.batchLength
    );
  }

  public static fromBuffer(buffer: Buffer): KafkaClusterMetadataRecordBatch {
    let currentOffset = 0;

    const baseOffset = buffer.readBigInt64BE(currentOffset);
    currentOffset += 8;

    const batchLength = buffer.readInt32BE(currentOffset);
    currentOffset += 4;

    const partitionLeaderEpoch = buffer.readInt32BE(currentOffset);
    currentOffset += 4;

    const magicByte = buffer.readInt8(currentOffset);
    currentOffset += 1;

    const crc = buffer.readUInt32BE(currentOffset);
    currentOffset += 4;

    const attributes = buffer.readInt16BE(currentOffset);
    currentOffset += 2;

    const lastOffsetDelta = buffer.readInt32BE(currentOffset);
    currentOffset += 4;

    const baseTimestamp = buffer.readBigInt64BE(currentOffset);
    currentOffset += 8;

    const maxTimestamp = buffer.readBigInt64BE(currentOffset);
    currentOffset += 8;

    const producerId = buffer.readBigInt64BE(currentOffset);
    currentOffset += 8;

    const producerEpoch = buffer.readInt16BE(currentOffset);
    currentOffset += 2;

    const baseSequence = buffer.readInt32BE(currentOffset);
    currentOffset += 4;

    const recordCount = buffer.readUInt32BE(currentOffset);
    currentOffset += 4;

    // Read the record batch items
    const recordBatchItems: KafkaClusterMetadataRecordBatchItem[] = [];

    for (let i = 0; i < recordCount; i++) {
      const { value: recordLength, length: recordLengthSize } =
        utils.readVariant(buffer.subarray(currentOffset), true);
      currentOffset += recordLengthSize;

      const attributes = buffer.readUInt8(currentOffset);
      currentOffset += 1;

      const timestampDelta = buffer.readInt8(currentOffset);
      currentOffset += 1;

      const offsetDelta = buffer.readInt8(currentOffset);
      currentOffset += 1;

      const { value: keyLength, length: keyLengthSize } = utils.readVariant(
        buffer.subarray(currentOffset),
        true
      );
      currentOffset += keyLengthSize;

      const { value: valueLength, length: valueLengthSize } = utils.readVariant(
        buffer.subarray(currentOffset),
        true
      );
      currentOffset += valueLengthSize;

      const recordValue = buffer.subarray(
        currentOffset,
        currentOffset + valueLength
      );

      const recordType = recordValue.readInt8(1);

      let valueRecord:
        | KafkaClusterMetadataTopicRecord
        | KafkaClusterMetadataPartitionRecord
        | KafkaClusterMetadataFeatureLevelRecord
        | null = null;

      switch (recordType) {
        case EMetadataRecordType.FEATURE_LEVEL:
          valueRecord =
            KafkaClusterMetadataFeatureLevelRecord.fromBuffer(recordValue);
          break;
        case EMetadataRecordType.TOPIC:
          valueRecord = KafkaClusterMetadataTopicRecord.fromBuffer(recordValue);
          break;
        case EMetadataRecordType.PARTITION:
          valueRecord =
            KafkaClusterMetadataPartitionRecord.fromBuffer(recordValue);
          break;
        default:
          console.log(
            `Record ${i}: Unknown record type: ${recordType}, skipping`
          );
          break;
      }

      currentOffset += valueLength;

      const headersLength = buffer.readUInt8(currentOffset);
      currentOffset += 1; // Skip headers

      recordBatchItems.push(
        new KafkaClusterMetadataRecordBatchItem(
          recordLength,
          attributes,
          timestampDelta,
          offsetDelta,
          keyLength,
          valueLength,
          valueRecord,
          headersLength
        )
      );
    }

    const recordBatch = new KafkaClusterMetadataRecordBatch(
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
      recordBatchItems
    );

    return recordBatch;
  }

  public getTopicRecord(): KafkaClusterMetadataTopicRecord {
    const topicRecord = this.recordBatchItems.find(
      (item) => item.value instanceof KafkaClusterMetadataTopicRecord
    )?.value as KafkaClusterMetadataTopicRecord;

    return topicRecord;
  }

  public getPartitionRecords(): KafkaClusterMetadataPartitionRecord[] {
    const partitionRecord = this.recordBatchItems
      .filter(
        (item) => item.value instanceof KafkaClusterMetadataPartitionRecord
      )
      .map((item) => item.value as KafkaClusterMetadataPartitionRecord);

    return partitionRecord;
  }
}

class KafkaClusterMetadataRecordBatchItem {
  constructor(
    public length: number,
    public attributes: number,
    public timestampDelta: number,
    public offsetDelta: number,
    public keyLength: number,
    public valueLength: number,
    public value:
      | KafkaClusterMetadataTopicRecord
      | KafkaClusterMetadataPartitionRecord
      | KafkaClusterMetadataFeatureLevelRecord
      | null,
    public headersLength: number
  ) {}
}

class KafkaClusterMetadataFeatureLevelRecord {
  constructor(
    public frameVersion: number,
    public type: number,
    public version: number,
    public nameLength: number,
    public name: string,
    public featureLevel: number,
    public tagFieldsCount: number
  ) {}

  public static fromBuffer(
    buffer: Buffer
  ): KafkaClusterMetadataFeatureLevelRecord {
    let currentOffset = 0;

    const frameVersion = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    const type = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    const version = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    const nameLength = buffer.readUInt8(currentOffset) - 1;
    currentOffset += 1;

    const name = buffer
      .subarray(currentOffset, currentOffset + nameLength)
      .toString("utf-8");
    currentOffset += nameLength;

    const featureLevel = buffer.readUInt16BE(currentOffset);
    currentOffset += 2;

    const tagFieldsCount = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    return new KafkaClusterMetadataFeatureLevelRecord(
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

export class KafkaClusterMetadataTopicRecord {
  constructor(
    public frameVersion: number,
    public type: number,
    public version: number,
    public nameLength: number,
    public name: string,
    public uuid: Buffer,
    public tagFieldsCount: number
  ) {}

  public static fromBuffer(buffer: Buffer): KafkaClusterMetadataTopicRecord {
    let currentOffset = 0;

    const frameVersion = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    const type = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    const version = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    const nameLength = buffer.readUInt8(currentOffset) - 1;
    currentOffset += 1;

    const name = buffer
      .subarray(currentOffset, currentOffset + nameLength)
      .toString("utf-8");
    currentOffset += nameLength;

    const uuid = buffer.subarray(currentOffset, currentOffset + 16);
    currentOffset += 16;

    const tagFieldsCount = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    return new KafkaClusterMetadataTopicRecord(
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

export class KafkaClusterMetadataPartitionRecord {
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

  public static fromBuffer(
    buffer: Buffer
  ): KafkaClusterMetadataPartitionRecord {
    let currentOffset = 0;

    const frameVersion = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    const type = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    const version = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    const partitionId = buffer.readUInt32BE(currentOffset);
    currentOffset += 4;

    const topicUuid = buffer.subarray(currentOffset, currentOffset + 16);
    currentOffset += 16;

    const lengthOfReplicas = buffer.readUInt8(currentOffset) - 1;
    currentOffset += 1;
    const replicas = [];
    for (let i = 0; i < lengthOfReplicas; i++) {
      const replicaId = buffer.readUInt32BE(currentOffset);
      replicas.push(replicaId);
      currentOffset += 4;
    }

    currentOffset += lengthOfReplicas * 4;

    const lengthOfIsr = buffer.readUInt8(currentOffset) - 1;
    currentOffset += 1;
    const isr = [];
    for (let i = 0; i < lengthOfIsr; i++) {
      const isrId = buffer.readUInt32BE(currentOffset);
      isr.push(isrId);
      currentOffset += 4;
    }

    const lengthOfRemovingReplicas = buffer.readUInt8(currentOffset) - 1;
    currentOffset += 1;
    const removingReplicas = [];
    for (let i = 0; i < lengthOfRemovingReplicas; i++) {
      const removingReplicaId = buffer.readUInt32BE(currentOffset);
      removingReplicas.push(removingReplicaId);
      currentOffset += 4;
    }

    const lengthOfAddingReplicas = buffer.readUInt8(currentOffset) - 1;
    currentOffset += 1;
    const addingReplicas = [];
    for (let i = 0; i < lengthOfAddingReplicas; i++) {
      const addingReplicaId = buffer.readUInt32BE(currentOffset);
      addingReplicas.push(addingReplicaId);
      currentOffset += 4;
    }

    const leader = buffer.readUInt32BE(currentOffset);
    currentOffset += 4;

    const leaderEpoch = buffer.readUInt32BE(currentOffset);
    currentOffset += 4;

    const partitionEpoch = buffer.readUInt32BE(currentOffset);
    currentOffset += 4;

    const lengthOfDirectory = buffer.readUInt8(currentOffset) - 1;
    currentOffset += 1;
    const directory = buffer.subarray(
      currentOffset,
      currentOffset + lengthOfDirectory * 16
    );
    currentOffset += lengthOfDirectory * 16;

    const tagFieldsCount = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    return new KafkaClusterMetadataPartitionRecord(
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
