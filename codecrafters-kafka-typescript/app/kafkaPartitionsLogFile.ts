import fs from "fs";
import { KafkaRecordBatch } from "./metaDataHandler";

export class KafkaPartitionLogFile {
  constructor(public recordBatches: KafkaRecordBatch[]) {}

  public static fromFile(filePath: string): KafkaPartitionLogFile {
    // Handle file not found error
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const data: Buffer = fs.readFileSync(filePath);
    console.log(`Reading file: ${filePath} with size: ${data.length}`);

    return KafkaPartitionLogFile.fromBuffer(data);
  }

  public static fromBuffer(buffer: Buffer): KafkaPartitionLogFile {
    let currentOffset: number = 0;
    const recordBatches: KafkaRecordBatch[] = [];

    while (currentOffset < buffer.length) {
      // Start reading first record batch
      const recordBatch = KafkaRecordBatch.fromBuffer(
        buffer.subarray(currentOffset)
      );

      currentOffset += recordBatch.bufferSize();
      recordBatches.push(recordBatch);
    }

    const logFile: KafkaPartitionLogFile = new KafkaPartitionLogFile(
      recordBatches
    );

    return logFile;
  }

  public getRecords(): KafkaRecordBatch[] {
    return this.recordBatches;
  }

  public static write(
    topicName: string,
    partitionIndex: number,
    recordBatches: KafkaRecordBatch[]
  ): void {
    const data: Buffer[] = recordBatches.flatMap(
      (recordBatch: KafkaRecordBatch) =>
        KafkaRecordBatch.buildRecordBatchBuffer(recordBatch)
    );

    fs.writeFileSync(
      `/tmp/kraft-combined-logs/${topicName}-${partitionIndex}/00000000000000000000.log`,
      Buffer.concat([...data])
    );
  }
}
