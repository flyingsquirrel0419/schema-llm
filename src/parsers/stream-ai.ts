import type { ZodTypeAny } from "zod";
import { extractJSONCandidates } from "../core/extractor.js";
import { normalizeAIResponse } from "../core/normalize-input.js";
import { repairJSON } from "../core/repairer.js";
import { validateAgainstSchema } from "../core/validator.js";
import { ParseError } from "../errors.js";
import type { StreamOptions } from "../types/index.js";
import { safeJSONParse } from "../utils/json-utils.js";

const defaultOptions: Required<
  Pick<StreamOptions, "emitPartial" | "repair" | "timeout">
> = {
  emitPartial: true,
  repair: true,
  timeout: 30_000,
};

async function* readableStreamToAsyncIterable(
  stream: ReadableStream<unknown>
): AsyncGenerator<unknown> {
  const reader = stream.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        return;
      }
      yield result.value;
    }
  } finally {
    reader.releaseLock();
  }
}

function normalizeChunk(chunk: unknown): string {
  const normalized = normalizeAIResponse(chunk);
  if (normalized) {
    return normalized.text;
  }
  return typeof chunk === "string" ? chunk : String(chunk);
}

function makeSchemaPartial<TSchema extends ZodTypeAny>(
  schema: TSchema
): ZodTypeAny {
  const partial = (schema as { partial?: () => ZodTypeAny }).partial;
  return typeof partial === "function" ? partial.call(schema) : schema;
}

function emitCurrentPartial<TSchema extends ZodTypeAny>(
  buffer: string,
  schema: TSchema,
  repair: boolean
): Partial<TSchema["_output"]> | null {
  const candidate = extractJSONCandidates(buffer).at(-1);
  if (!candidate) {
    return null;
  }

  const raw = repair
    ? (repairJSON(candidate.raw) ?? candidate.raw)
    : candidate.raw;
  const parsed = safeJSONParse(raw);
  if (
    !parsed.success ||
    parsed.data === null ||
    typeof parsed.data !== "object"
  ) {
    return null;
  }

  const partialSchema = makeSchemaPartial(schema);
  const validation = validateAgainstSchema(partialSchema, parsed.data);
  if (
    !validation.success ||
    validation.data === null ||
    typeof validation.data !== "object"
  ) {
    return null;
  }

  return validation.data as Partial<TSchema["_output"]>;
}

export async function* streamAI<TSchema extends ZodTypeAny>(
  stream: AsyncIterable<unknown> | ReadableStream<unknown>,
  schema: TSchema,
  options: StreamOptions = {}
): AsyncGenerator<Partial<TSchema["_output"]>, TSchema["_output"], undefined> {
  const merged = { ...defaultOptions, ...options };
  const iterable =
    typeof ReadableStream !== "undefined" && stream instanceof ReadableStream
      ? readableStreamToAsyncIterable(stream)
      : (stream as AsyncIterable<unknown>);

  let buffer = "";
  let lastEmission = "";
  const startedAt = Date.now();

  for await (const chunk of iterable) {
    if (Date.now() - startedAt > merged.timeout) {
      throw new ParseError(
        "STREAM_TIMEOUT",
        `Streaming parser timed out after ${merged.timeout}ms.`,
        { input: buffer, extracted: undefined, repaired: undefined, logs: [] }
      );
    }

    buffer += normalizeChunk(chunk);

    if (merged.emitPartial) {
      const partial = emitCurrentPartial(buffer, schema, merged.repair);
      if (partial) {
        const serialized = JSON.stringify(partial);
        if (serialized !== lastEmission) {
          lastEmission = serialized;
          yield partial;
        }
      }
    }

    const candidates = extractJSONCandidates(buffer);
    const candidate = candidates.at(-1);
    if (!candidate) {
      continue;
    }

    const raw = merged.repair
      ? (repairJSON(candidate.raw) ?? candidate.raw)
      : candidate.raw;
    const parsed = safeJSONParse(raw);
    if (!parsed.success) {
      continue;
    }

    const validation = validateAgainstSchema(schema, parsed.data);
    if (validation.success) {
      const serialized = JSON.stringify(validation.data);
      if (serialized !== lastEmission) {
        yield validation.data as Partial<TSchema["_output"]>;
      }
      return validation.data;
    }
  }

  throw new ParseError(
    "JSON_EXTRACT_FAILED",
    "Stream ended before a valid JSON payload matching the schema was produced.",
    { input: buffer, extracted: undefined, repaired: undefined, logs: [] }
  );
}
