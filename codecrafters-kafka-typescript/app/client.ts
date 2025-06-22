import net from "net";

const client = net.createConnection(
  { host: "127.0.0.1", port: 9092, localPort: 0 },
  () => {
    console.log(
      `Connected to server ${client.remoteAddress}:${client.remotePort}`
    );
    // Send something
    client.write("Hello from client!");
  }
);
