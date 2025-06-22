import net from "net";
import { kafkaHandler } from "./kafkaHandler";

const server: net.Server = net.createServer((socket: net.Socket) => {
  console.log(`Client ${socket.remoteAddress}:${socket.remotePort} CONNECTED!`);

  socket.on("data", (data) => {
    console.log("BUFFER: ");
    console.log(data);
    console.log(`BUFFER TO STRING: ${data.toString()}`);

    const header = kafkaHandler.parseKafkaHeader(data);
    const responseBuffer = Buffer.alloc(8);
    responseBuffer.writeInt32BE(0, 0);
    responseBuffer.writeInt32BE(header.correlationID, 4);

    socket.write(responseBuffer);
  });
});

server.listen(9092, "127.0.0.1");
