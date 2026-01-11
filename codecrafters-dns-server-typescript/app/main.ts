import * as dgram from "dgram";
import { DnsWriter } from "./dnsWriter";
import type { DnsHeader, ParsedAnswer, ParsedQuestion } from "./model";
import { DnsParser } from "./dnsParser";

const udpSocket: dgram.Socket = dgram.createSocket("udp4");
udpSocket.bind(2053, "127.0.0.1");

const address: string = process.argv[3];
const [resolverIp, resolverPort]: string[] | null[] = address
  ? address.split(":")
  : [null, null];

udpSocket.on("message", async (data: Buffer, remoteAddr: dgram.RemoteInfo) => {
  try {
    let questionsBuffer: Buffer = Buffer.alloc(0);
    let answersBuffer: Buffer = Buffer.alloc(0);

    console.log(`Received data from ${remoteAddr.address}:${remoteAddr.port}`);
    console.log("Received data buffer", data);

    const parsedDnsHeader: DnsHeader = DnsParser.parseDnsHeader(data);
    const { parsedQuestions }: { parsedQuestions: ParsedQuestion[] } =
      DnsParser.parseQuestionSection(
        data,
        parsedDnsHeader.questionCount ?? -9999
      );

    const responses: ParsedAnswer[] = await Promise.all(
      parsedQuestions.map((question: ParsedQuestion) =>
        forwardQuestionAndCollectAnswer(parsedDnsHeader, question)
      )
    );

    if (parsedDnsHeader.questionCount === undefined) {
      throw new Error("Invalid parsed header");
    }

    for (let i = 0; i < parsedDnsHeader.questionCount; i++) {
      const questionSection: Buffer = DnsWriter.createQuestionSection(
        parsedQuestions[i].domainName,
        "A",
        1
      );
      const answerSection: Buffer = DnsWriter.createAnswerSection(
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

    const header: Buffer = DnsWriter.createDnsHeader({
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

async function forwardQuestionAndCollectAnswer(
  parsedHeader: DnsHeader,
  parsedQuestion: ParsedQuestion
): Promise<ParsedAnswer> {
  return new Promise((resolve, reject) => {
    const forwarderSocket: dgram.Socket = dgram.createSocket("udp4");
    const header: Buffer = DnsWriter.createDnsHeader({
      packetId: parsedHeader.packetId,
      isRecursionDesired: true,
      isResponse: false,
      questionCount: 1,
      answerRecordCount: 0,
      operationCode: 0,
      responseCode: 0,
    });
    const question: Buffer = DnsWriter.createQuestionSection(
      parsedQuestion.domainName,
      "A",
      1
    );
    const query: Buffer = Buffer.concat([
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

    forwarderSocket.on("message", (data: Buffer) => {
      DnsParser.parseDnsHeader(data);
      const { endIndex }: { endIndex: number } = DnsParser.parseQuestionSection(
        data,
        1
      );
      const parsedAnswer: ParsedAnswer[] = DnsParser.parseAnswersSection(
        data,
        endIndex,
        1
      );

      resolve(parsedAnswer[0]);
      forwarderSocket.close();
    });

    forwarderSocket.on("error", (err) => {
      console.error("Forwarding question error:", err);
      forwarderSocket.close();
      reject();
    });
  });
}
