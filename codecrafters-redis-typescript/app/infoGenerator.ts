export class InfoGenerator {
  public static info = {
    master_repl_offset: 0,
    master_replid: "8371b4fb1155b71f4a04d3e1bc3e18c4a990aeeb",
    role: "master",
  };

  constructor() {}

  public static generate(): string {
    let result: string = "";

    Object.keys(this.info).forEach(
      (key) => (result += `${key}:${(this.info as any)[key]}`),
    );

    return result;
  }
}
