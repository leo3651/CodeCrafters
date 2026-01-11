import type { DnsHeader, ParsedAnswer, ParsedQuestion } from "./model";

export class DnsParser {
  public static parseDnsHeader(dnsHeaderBuffer: Buffer): DnsHeader {
    const dnsHeaderInfo: DnsHeader = {};

    const packetId: number = dnsHeaderBuffer.readUInt16BE(0);
    dnsHeaderInfo.packetId = packetId;

    const byte2: number = dnsHeaderBuffer.readUInt8(2);

    dnsHeaderInfo.isResponse = (byte2 & 0b10000000) === 0b10000000;
    dnsHeaderInfo.operationCode = byte2 & 0b01111000;
    dnsHeaderInfo.isAuthoritativeAnswer = (byte2 & 0b00000100) === 0b00000100;
    dnsHeaderInfo.truncation = byte2 & 0b00000010;
    dnsHeaderInfo.isRecursionDesired = (0b00000001 & byte2) === 0b00000001;

    const byte3: number = dnsHeaderBuffer.readUInt8(3);

    dnsHeaderInfo.isRecursionAvailable = (byte3 & 0b10000000) === 0b10000000;
    dnsHeaderInfo.reserved = byte3 & 0b01110000;
    dnsHeaderInfo.responseCode = byte3 & 0b00001111;

    dnsHeaderInfo.questionCount = dnsHeaderBuffer.readUInt16BE(4);
    dnsHeaderInfo.answerRecordCount = dnsHeaderBuffer.readUInt16BE(6);
    dnsHeaderInfo.authorityRecordCount = dnsHeaderBuffer.readUInt16BE(8);
    dnsHeaderInfo.additionalRecordCount = dnsHeaderBuffer.readUInt16BE(10);

    return dnsHeaderInfo;
  }

  public static parseQuestionSection(
    MessageBuf: Buffer,
    questionsCount: number
  ): { parsedQuestions: ParsedQuestion[]; endIndex: number } {
    let parsedQuestions: ParsedQuestion[] = [];
    let i: number = 12;

    while (parsedQuestions.length < questionsCount) {
      const labels: Buffer[] = [];

      i = this.decodeDomainName(MessageBuf, labels, i);

      const domainName: string = labels.join(".");
      i++;
      const questionType: Buffer = MessageBuf.subarray(i, i + 2);
      i += 2;
      const questionClass: Buffer = MessageBuf.subarray(i, i + 2);
      i += 2;

      parsedQuestions.push({ domainName, questionType, questionClass });
    }

    return { parsedQuestions, endIndex: i };
  }

  public static parseAnswersSection(
    MessageBuf: Buffer,
    startingIndex: number,
    answersCount: number
  ): ParsedAnswer[] {
    let i: number = startingIndex;
    const parsedAnswers: ParsedAnswer[] = [];

    while (parsedAnswers.length < answersCount) {
      const labels: Buffer[] = [];

      i = this.decodeDomainName(MessageBuf, labels, i);

      const domainName: string = labels.join(".");
      i++;
      const answerType: Buffer = MessageBuf.subarray(i, i + 2);
      i += 2;
      const answerClass: Buffer = MessageBuf.subarray(i, i + 2);
      i += 2;
      const timeToLive: number = MessageBuf.subarray(i, i + 4).readUInt32BE(0);
      i += 4;
      const length: number = MessageBuf.subarray(i, i + 2).readUInt16BE(0);
      i += 2;
      const data: string = MessageBuf.subarray(i, i + length).toString(
        "binary"
      );

      parsedAnswers.push({
        domainName,
        answerType,
        answerClass,
        timeToLive,
        data,
      });
    }

    return parsedAnswers;
  }

  private static decodeDomainName(
    buffer: Buffer,
    labels: Buffer[],
    i: number
  ): number {
    while (buffer[i] !== 0) {
      if ((buffer[i] & 0b11000000) === 0b11000000) {
        let pointer: number = 0;
        pointer = 0b00111111 & buffer[i];
        pointer <<= 8;
        pointer = 0b11111111 & buffer[i + 1];

        while (buffer[pointer] !== 0) {
          labels.push(
            buffer.subarray(pointer + 1, pointer + 1 + buffer[pointer])
          );
          pointer += buffer[pointer] + 1;
        }
        i++;
        break;
      } else {
        labels.push(buffer.subarray(i + 1, i + 1 + buffer[i]));
        i += buffer[i] + 1;
      }
    }

    return i;
  }
}
