export function getQuestionTypeBuffer(recordType: string): Buffer {
  const qTypeBuffer = Buffer.alloc(2);
  let type = -999;

  // A
  if (recordType === "A") {
    type = 1;
  }

  // CNAME
  else if (recordType === "CNAME") {
    type = 5;
  }

  qTypeBuffer.writeUint16BE(type, 0);
  return qTypeBuffer;
}

export function getQuestionClassBuffer(qClassNum: number) {
  const qClass = Buffer.alloc(2);
  qClass.writeUint16BE(qClassNum, 0);
  return qClass;
}
