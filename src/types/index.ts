import type { infer as Infer, ZodTypeAny } from "zod";

export type ParserSchema = ZodTypeAny;
export type InferSchema<TSchema extends ParserSchema> = Infer<TSchema>;

export type ParseStrategy = "first" | "largest" | "schema-match";

export interface ParseOptions {
  fallback?: boolean;
  repair?: boolean;
  strategy?: ParseStrategy;
  debug?: boolean;
}

export interface StreamOptions extends ParseOptions {
  emitPartial?: boolean;
  timeout?: number;
}

export interface ExtractedCandidate {
  raw: string;
  start: number;
  end: number;
  source: "code-block" | "xml" | "inline" | "entire";
}

export interface ParseDebugLog {
  stage: "normalize" | "extract" | "repair" | "validate";
  message: string;
}

export interface ParseResultMeta {
  input: string;
  extracted: string | undefined;
  repaired: string | undefined;
  logs: ParseDebugLog[];
}

export interface NormalizedAIResponse {
  text: string;
}
