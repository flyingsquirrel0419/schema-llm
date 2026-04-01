import type { ZodTypeAny } from "zod";
import { extractJSONCandidates } from "../core/extractor.js";
import { normalizeAIResponse } from "../core/normalize-input.js";
import { repairJSON } from "../core/repairer.js";
import { validateAgainstSchema } from "../core/validator.js";
import { ParseError } from "../errors.js";
import type {
  ExtractedCandidate,
  ParseDebugLog,
  ParseOptions,
} from "../types/index.js";
import { safeJSONParse } from "../utils/json-utils.js";

const defaultOptions: Required<
  Pick<ParseOptions, "debug" | "repair" | "strategy">
> = {
  debug: false,
  repair: true,
  strategy: "first",
};

interface CandidateAttempt {
  candidate: ExtractedCandidate;
  extracted: string;
  repaired?: string;
  value?: unknown;
  validation?:
    | { success: true; data: unknown }
    | { success: false; message: string; error: unknown };
}

function pushLog(
  logs: ParseDebugLog[],
  enabled: boolean,
  stage: ParseDebugLog["stage"],
  message: string
): void {
  if (enabled) {
    logs.push({ stage, message });
  }
}

function sortCandidates(
  candidates: ExtractedCandidate[],
  strategy: Required<Pick<ParseOptions, "strategy">>["strategy"]
): ExtractedCandidate[] {
  if (strategy === "largest") {
    return [...candidates].sort(
      (left, right) => right.raw.length - left.raw.length
    );
  }

  return candidates;
}

function evaluateCandidate<TSchema extends ZodTypeAny>(
  candidate: ExtractedCandidate,
  schema: TSchema,
  repairEnabled: boolean,
  logs: ParseDebugLog[],
  debug: boolean
): CandidateAttempt {
  pushLog(
    logs,
    debug,
    "extract",
    `Evaluating candidate from ${candidate.source}.`
  );

  const extracted = candidate.raw.trim();
  const parsed = safeJSONParse(extracted);
  if (parsed.success) {
    const validation = validateAgainstSchema(schema, parsed.data);
    return {
      candidate,
      extracted,
      value: parsed.data,
      validation,
    };
  }

  if (repairEnabled) {
    const repaired = repairJSON(extracted);
    if (repaired) {
      pushLog(
        logs,
        debug,
        "repair",
        `Repaired candidate from ${candidate.source}.`
      );
      const repairedParsed = safeJSONParse(repaired);
      if (repairedParsed.success) {
        const validation = validateAgainstSchema(schema, repairedParsed.data);
        return {
          candidate,
          extracted,
          repaired,
          value: repairedParsed.data,
          validation,
        };
      }
    }
  }

  return {
    candidate,
    extracted,
  };
}

export async function parseAI<TSchema extends ZodTypeAny>(
  input: unknown,
  schema: TSchema,
  options: ParseOptions & { fallback: true }
): Promise<TSchema["_output"] | null>;
export async function parseAI<TSchema extends ZodTypeAny>(
  input: unknown,
  schema: TSchema,
  options?: ParseOptions
): Promise<TSchema["_output"]>;
export async function parseAI<TSchema extends ZodTypeAny>(
  input: unknown,
  schema: TSchema,
  options: ParseOptions = {}
): Promise<TSchema["_output"] | null> {
  const merged = { ...defaultOptions, ...options };
  const logs: ParseDebugLog[] = [];

  const normalized = normalizeAIResponse(input);
  if (!normalized) {
    const meta = {
      input: String(input),
      extracted: undefined,
      repaired: undefined,
      logs,
    };
    if (options.fallback) {
      return null;
    }
    throw new ParseError(
      "INPUT_NORMALIZATION_FAILED",
      "Could not normalize AI response into text.",
      meta
    );
  }

  pushLog(logs, merged.debug, "normalize", "Normalized AI response.");

  const candidates = sortCandidates(
    extractJSONCandidates(normalized.text),
    merged.strategy
  );

  if (candidates.length === 0) {
    const meta = {
      input: normalized.text,
      extracted: undefined,
      repaired: undefined,
      logs,
    };
    if (options.fallback) {
      return null;
    }
    throw new ParseError(
      "JSON_EXTRACT_FAILED",
      "Could not find a JSON payload in the AI response.",
      meta
    );
  }

  const attempts = candidates.map((candidate) =>
    evaluateCandidate(candidate, schema, merged.repair, logs, merged.debug)
  );

  if (merged.strategy === "schema-match") {
    const successful = attempts.find((attempt) => attempt.validation?.success);
    if (successful?.validation?.success) {
      return successful.validation.data as TSchema["_output"];
    }
  } else {
    const firstAttempt = attempts[0];
    if (firstAttempt?.validation?.success) {
      return firstAttempt.validation.data as TSchema["_output"];
    }
  }

  const validated = attempts.find((attempt) => attempt.validation?.success);
  if (validated?.validation?.success) {
    return validated.validation.data as TSchema["_output"];
  }

  const lastAttempt = attempts.at(-1);
  const meta = {
    input: normalized.text,
    extracted: lastAttempt?.extracted,
    repaired: lastAttempt?.repaired,
    logs,
  };

  if (options.fallback) {
    return null;
  }

  if (attempts.some((attempt) => attempt.extracted)) {
    const validationFailure = attempts.find(
      (attempt) => attempt.validation && !attempt.validation.success
    );
    if (
      validationFailure?.validation &&
      !validationFailure.validation.success
    ) {
      throw new ParseError(
        "SCHEMA_VALIDATION_FAILED",
        validationFailure.validation.message,
        meta,
        validationFailure.validation.error
      );
    }

    throw new ParseError(
      "JSON_REPAIR_FAILED",
      "Found a JSON-like payload but could not parse it.",
      meta
    );
  }

  throw new ParseError(
    "JSON_EXTRACT_FAILED",
    "Could not find a JSON payload in the AI response.",
    meta
  );
}
