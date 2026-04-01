import type { ParseResultMeta } from "./types/index.js";

export type ParseErrorCode =
  | "INPUT_NORMALIZATION_FAILED"
  | "JSON_EXTRACT_FAILED"
  | "JSON_REPAIR_FAILED"
  | "SCHEMA_VALIDATION_FAILED"
  | "STREAM_TIMEOUT";

export class ParseError extends Error {
  public readonly code: ParseErrorCode;
  public readonly rawInput: string;
  public readonly extracted: string | undefined;
  public readonly repaired: string | undefined;
  public readonly details?: unknown;
  public readonly logs: ParseResultMeta["logs"];

  public constructor(
    code: ParseErrorCode,
    message: string,
    meta: ParseResultMeta,
    details?: unknown
  ) {
    super(message);
    this.name = "ParseError";
    this.code = code;
    this.rawInput = meta.input;
    this.extracted = meta.extracted;
    this.repaired = meta.repaired;
    this.details = details;
    this.logs = meta.logs;
  }
}
