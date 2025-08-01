import fs from "fs";
import { KafkaClusterMetadataRecordBatch } from "./metaDataParser";

export class KafkaPartitionLogFile {
  constructor(public batches: KafkaClusterMetadataRecordBatch[]) {}

  public static fromFile(filePath: string): KafkaPartitionLogFile {
    // Handle file not found error
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const data = fs.readFileSync(filePath);
    console.log(`Reading file: ${filePath} with size: ${data.length}`);
    return KafkaPartitionLogFile.fromBuffer(data);
  }

  public static fromBuffer(buffer: Buffer): KafkaPartitionLogFile {
    let currentOffset = 0;
    const batches: KafkaClusterMetadataRecordBatch[] = [];

    while (currentOffset < buffer.length) {
      // Start reading first record batch

      const batch = KafkaClusterMetadataRecordBatch.fromBuffer(
        buffer.subarray(currentOffset)
      );
      // console.log(`[KafkaPartitionRecordBatch] debug: ${batch.debugString()}`);
      currentOffset += batch.bufferSize();
      batches.push(batch);
    }

    console.log(`batches size: ${batches.length}`);

    const logFile = new KafkaPartitionLogFile(batches);

    return logFile;
  }

  getRecords(): KafkaClusterMetadataRecordBatch[] {
    return this.batches;
  }
}
