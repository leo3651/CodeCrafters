import net from "net";
import { kafkaHandler } from "./kafkaHandler";

const server: net.Server = net.createServer((socket: net.Socket) => {
  console.log(`Client ${socket.remoteAddress}:${socket.remotePort} CONNECTED!`);

  socket.on("data", (data) => {
    console.log("RECEIVED BUFFER: ");
    console.log(data);
    console.log(`RECEIVED BUFFER TO STRING: ${data.toString()}`);

    const reqHeader = kafkaHandler.parseKafkaHeader(data);
    console.log(`REQ HEADER: `);
    console.log(reqHeader);

    const resBuffer = kafkaHandler.createResponseHeader(reqHeader);
    console.log(`RES BUFFER: `);
    console.log(resBuffer);

    socket.write(resBuffer);
  });
});

server.listen(9092, "127.0.0.1");
