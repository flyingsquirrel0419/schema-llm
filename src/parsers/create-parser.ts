import type { ZodTypeAny } from "zod";
import type { ParseOptions, StreamOptions } from "../types/index.js";
import { parseAI } from "./parse-ai.js";
import { streamAI } from "./stream-ai.js";

export function createParser<TSchema extends ZodTypeAny>(
  schema: TSchema,
  options: ParseOptions = {}
) {
  return {
    parse: (input: unknown) => parseAI(input, schema, options),
    stream: (
      stream: AsyncIterable<unknown> | ReadableStream<unknown>,
      streamOptions: StreamOptions = {}
    ) => streamAI(stream, schema, { ...options, ...streamOptions }),
  };
}
