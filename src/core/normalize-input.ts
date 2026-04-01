import type { NormalizedAIResponse } from "../types/index.js";

function joinExtracted(parts: Array<string | null>): string | null {
  const textParts = parts.filter(
    (item): item is string => typeof item === "string"
  );
  return textParts.length > 0 ? textParts.join("\n") : null;
}

function extractString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return joinExtracted(value.map((item) => extractString(item)));
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  if ("text" in value && typeof value.text === "string") {
    return value.text;
  }

  if ("output_text" in value && typeof value.output_text === "string") {
    return value.output_text;
  }

  if ("content" in value) {
    const content = extractString(value.content);
    if (content) {
      return content;
    }
  }

  if ("message" in value && value.message) {
    return extractString(value.message);
  }

  if ("delta" in value && value.delta) {
    return extractString(value.delta);
  }

  if ("choices" in value && Array.isArray(value.choices)) {
    return joinExtracted(value.choices.map((choice) => extractString(choice)));
  }

  if ("candidates" in value && Array.isArray(value.candidates)) {
    return joinExtracted(
      value.candidates.map((candidate) => extractString(candidate))
    );
  }

  if ("parts" in value && Array.isArray(value.parts)) {
    return joinExtracted(value.parts.map((part) => extractString(part)));
  }

  if ("response" in value && value.response) {
    return extractString(value.response);
  }

  if ("data" in value && value.data) {
    return extractString(value.data);
  }

  return null;
}

export function normalizeAIResponse(
  input: unknown
): NormalizedAIResponse | null {
  const text = extractString(input);
  if (typeof text !== "string") {
    return null;
  }

  return { text };
}
