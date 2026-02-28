import { createClient } from "./client";
import { InfoGenerator } from "./infoGenerator";
import { redisFile } from "./redisFile";
import { createServer } from "./server";

const args: string[] = process.argv.slice(2);
let port: number = 6379;

// --dir and --dbFileName
if (args.includes("--dir") && args.includes("--dbfilename")) {
  const dir: string = args[args.indexOf("--dir") + 1];
  const dbFileName: string = args[args.indexOf("--dbfilename") + 1];

  redisFile.readIfExists(dir, dbFileName);
}

// --port
if (
  args.includes("--port") &&
  Number.parseInt(args[args.indexOf("--port") + 1])
) {
  port = Number.parseInt(args[1]);
}

// --replicaof
if (args.includes("--replicaof")) {
  InfoGenerator.info.role = "slave";
  const host: string = args[args.indexOf("--replicaof") + 1];
  const [hostName, hostPort]: string[] = host.split(" ");
  createClient(hostName, Number.parseInt(hostPort), port);
}

createServer(port);
