import Anthropic from "@anthropic-ai/sdk";
import { z, type ZodType } from "zod";

// ─── Client Singleton ───────────────────────────────────────────────────────

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to your .env file."
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LLMResult<T> {
  data: T;
  inputTokens: number;
  outputTokens: number;
}

// ─── Structured Output via tool_use ─────────────────────────────────────────

/**
 * Call Claude with a Zod schema as structured output.
 * Uses the tool_use pattern: define a tool whose input_schema matches the Zod schema,
 * force the model to call it, then parse the result.
 */
export async function structuredCall<T>(params: {
  system: string;
  user: string;
  schema: ZodType<T>;
  schemaName: string;
  schemaDescription?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<LLMResult<T>> {
  const anthropic = getClient();

  // Zod v4 has built-in toJsonSchema
  const jsonSchema = z.toJSONSchema(params.schema, {
    target: "draft-2020-12",
  });

  const response = await anthropic.messages.create({
    model: params.model ?? "claude-sonnet-4-6",
    max_tokens: params.maxTokens ?? 4096,
    temperature: params.temperature ?? 0,
    system: params.system,
    messages: [{ role: "user", content: params.user }],
    tools: [
      {
        name: params.schemaName,
        description:
          params.schemaDescription ??
          `Output structured data matching the ${params.schemaName} schema`,
        input_schema: jsonSchema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool" as const, name: params.schemaName },
  });

  // Find the tool_use block
  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(
      `LLM did not return structured output. Stop reason: ${response.stop_reason}`
    );
  }

  // Validate against Zod schema
  const parsed = params.schema.parse(toolUse.input);

  return {
    data: parsed,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// ─── Simple Text Call ───────────────────────────────────────────────────────

export async function textCall(params: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<LLMResult<string>> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: params.model ?? "claude-sonnet-4-6",
    max_tokens: params.maxTokens ?? 2048,
    temperature: params.temperature ?? 0,
    system: params.system,
    messages: [{ role: "user", content: params.user }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const text = textBlock && textBlock.type === "text" ? textBlock.text : "";

  return {
    data: text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
