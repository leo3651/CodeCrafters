export function getRecordTypeBuffer(recordType: string): Buffer {
  const rTypeBuffer = Buffer.alloc(2);
  let type = -999;

  // A
  if (recordType === "A") {
    type = 1;
  }

  // CNAME
  else if (recordType === "CNAME") {
    type = 5;
  }

  rTypeBuffer.writeUint16BE(type, 0);
  return rTypeBuffer;
}

export function getRecordClassBuffer(qClassNum: number) {
  const recordClass = Buffer.alloc(2);
  recordClass.writeUint16BE(qClassNum, 0);
  return recordClass;
}
