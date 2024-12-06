import * as dgram from "dgram";
import { DnsHandler } from "./dnsHandler";
import type { DnsHeader, ParsedAnswer, ParsedQuestion } from "./model";

const udpSocket: dgram.Socket = dgram.createSocket("udp4");
udpSocket.bind(2053, "127.0.0.1");
const dnsHandler = new DnsHandler();

const address = process.argv[3];
const [resolverIp, resolverPort] = address ? address.split(":") : [null, null];

udpSocket.on("message", async (data: Buffer, remoteAddr: dgram.RemoteInfo) => {
  try {
    let questionsBuffer: Buffer = Buffer.alloc(0);
    let answersBuffer: Buffer = Buffer.alloc(0);

    console.log(`Received data from ${remoteAddr.address}:${remoteAddr.port}`);
    console.log("Received data buffer", data);

    const parsedDnsHeader = dnsHandler.parseDnsHeader(data);
    const { parsedQuestions, endIndex } = dnsHandler.parseQuestionSection(
      data,
      parsedDnsHeader.questionCount ?? -9999
    );

    const responses = await Promise.all(
      parsedQuestions.map((question) =>
        forwardQuestion(parsedDnsHeader, question)
      )
    );

    if (parsedDnsHeader.questionCount === undefined) {
      throw new Error("Invalid parsed header");
    }

    for (let i = 0; i < parsedDnsHeader.questionCount; i++) {
      const questionSection = dnsHandler.createQuestionSection(
        parsedQuestions[i].domainName,
        "A",
        1
      );
      const answerSection = dnsHandler.createAnswerSection(
        responses.length
          ? responses[i].domainName
          : parsedQuestions[i].domainName,
        "A",
        1,
        responses.length ? responses[i].timeToLive : 60,
        responses.length ? responses[i].data : "\x08\x08\x08\x08"
      );

      questionsBuffer = Buffer.concat([
        new Uint8Array(questionsBuffer),
        new Uint8Array(questionSection),
      ]);
      answersBuffer = Buffer.concat([
        new Uint8Array(answersBuffer),
        new Uint8Array(answerSection),
      ]);
    }

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

async function forwardQuestion(
  parsedHeader: DnsHeader,
  parsedQuestion: ParsedQuestion
): Promise<ParsedAnswer> {
  return new Promise((resolve, reject) => {
    const forwarderSocket: dgram.Socket = dgram.createSocket("udp4");
    const header = dnsHandler.createDnsHeader({
      packetId: parsedHeader.packetId,
      isRecursionDesired: true,
      isResponse: false,
      questionCount: 1,
      answerRecordCount: 0,
      operationCode: 0,
      responseCode: 0,
    });
    const question = dnsHandler.createQuestionSection(
      parsedQuestion.domainName,
      "A",
      1
    );
    const query = Buffer.concat([
      new Uint8Array(header),
      new Uint8Array(question),
    ]);

    if (resolverPort && resolverIp) {
      forwarderSocket.send(
        new Uint8Array(query),
        parseInt(resolverPort),
        resolverIp
      );
    } else {
      forwarderSocket.close();
      reject("NO ADDRESS TO FORWARD REQUEST");
    }

    forwarderSocket.on(
      "message",
      (data: Buffer, remoteAddr: dgram.RemoteInfo) => {
        const header = dnsHandler.parseDnsHeader(data);
        const { parsedQuestions, endIndex } = dnsHandler.parseQuestionSection(
          data,
          1
        );
        const parsedAnswer = dnsHandler.parseAnswersSection(data, endIndex, 1);

        resolve(parsedAnswer[0]);
        forwarderSocket.close();
      }
    );

    forwarderSocket.on("error", (err) => {
      console.error("THIS IS THE ERROR: ", err);
      forwarderSocket.close();
      reject();
    });
  });
}
