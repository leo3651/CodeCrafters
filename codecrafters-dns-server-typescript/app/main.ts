import * as dgram from "dgram";
import { DnsHandler } from "./dnsHandler";

const udpSocket: dgram.Socket = dgram.createSocket("udp4");
udpSocket.bind(2053, "127.0.0.1");
const dnsHandler = new DnsHandler();

udpSocket.on("message", (data: Buffer, remoteAddr: dgram.RemoteInfo) => {
  try {
    console.log(`Received data from ${remoteAddr.address}:${remoteAddr.port}`);
    console.log("Received data buffer", data);

    const parsedDnsHeader = dnsHandler.parseDnsHeader(data);
    const parsedQuestions = [];
    let questionsBuffer: Buffer = Buffer.alloc(0);
    let answersBuffer: Buffer = Buffer.alloc(0);

    let i = 12;
    while (i < data.length) {
      const parsedQuestionSection = dnsHandler.parseQuestionSection(
        data.slice(i),
        data
      );
      i += parsedQuestionSection.endIndex;
      parsedQuestions.push(parsedQuestionSection);
    }

    parsedQuestions.forEach((q) => {
      const questionSection = dnsHandler.createQuestionSection(
        q.domainName,
        "A",
        1
      );
      const answerSection = dnsHandler.createAnswerSection(
        q.domainName,
        "A",
        1,
        60,
        "\x08\x08\x08\x08"
      );

      questionsBuffer = Buffer.concat([
        new Uint8Array(questionsBuffer),
        new Uint8Array(questionSection),
      ]);
      answersBuffer = Buffer.concat([
        new Uint8Array(answersBuffer),
        new Uint8Array(answerSection),
      ]);
    });

    const header = dnsHandler.createDnsHeader({
      isResponse: true,
      packetId: parsedDnsHeader.packetId,
      questionCount: parsedQuestions.length,
      answerRecordCount: parsedQuestions.length,
      isRecursionDesired: parsedDnsHeader.isRecursionDesired,
      operationCode: parsedDnsHeader.operationCode,
      responseCode: parsedDnsHeader.operationCode === 0 ? 0 : 4,
    });

    udpSocket.send(
      new Uint8Array(
        Buffer.concat([
          new Uint8Array(header),
          new Uint8Array(questionsBuffer),
          new Uint8Array(answersBuffer),
        ])
      ),
      remoteAddr.port,
      remoteAddr.address
    );
  } catch (e) {
    console.log(`Error sending data: ${e}`);
  }
});
