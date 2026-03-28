import OpenAI from "openai";
import { bashTool, readTool, writeTool } from "./tools";
import fs from "fs";
import type {
  ChatCompletion,
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources";
import { execSync } from "child_process";

async function main() {
  const [, , flag, prompt]: string[] = process.argv;
  const apiKey: string | undefined = process.env.OPENROUTER_API_KEY;
  const baseURL: string =
    process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  if (flag !== "-p" || !prompt) {
    throw new Error("error: -p flag is required");
  }

  const client: OpenAI = new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
  });

  const messages: ChatCompletionMessageParam[] = [
    { role: "user", content: prompt },
  ];

  while (true) {
    const response: ChatCompletion & {
      _request_id?: string | null;
    } = await client.chat.completions.create({
      model: "anthropic/claude-haiku-4.5",
      messages: messages,
      tools: [readTool, writeTool, bashTool],
    });

    const choices: ChatCompletion.Choice[] = response.choices;
    const message: ChatCompletionMessage = choices[0].message;
    const toolCalls: ChatCompletionMessageToolCall[] | undefined =
      message.tool_calls;

    messages.push({
      role: "assistant",
      content: message.content ?? undefined,
      ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
    });

    if (toolCalls?.length) {
      messages.push(...extractToolMessages(toolCalls));
      continue;
    } else {
      console.log(message.content);
      break;
    }
  }
}

main();

function extractToolMessages(
  toolCalls: ChatCompletionMessageToolCall[],
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];

  for (const toolCall of toolCalls) {
    const functionName: string = (toolCall as any)?.function.name;
    const args: Record<string, string> = JSON.parse(
      (toolCall as any)?.function.arguments,
    );
    let content: string = "";

    if (functionName === "Read") {
      content = fs.readFileSync(args.file_path, "utf-8");
    }

    if (functionName === "Write") {
      content = args.content;
      fs.writeFileSync(args.file_path, content, "utf-8");
    }

    if (functionName === "Bash") {
      content = execSync(args.command, { encoding: "utf-8" });
    }

    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: content,
    });
  }

  return messages;
}
