import fs from "fs";

export class Init {
  public static execute(basePath = ""): void {
    fs.mkdirSync(`${basePath}.git`, { recursive: true });
    fs.mkdirSync(`${basePath}.git/objects`, { recursive: true });
    fs.mkdirSync(`${basePath}.git/refs`, { recursive: true });
    fs.writeFileSync(`${basePath}.git/HEAD`, `ref: refs/heads/main\n`);

    console.log(`Initialized git directory`);
  }
}
