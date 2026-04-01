import type { ExtractedCandidate } from "../types/index.js";
import { looksLikeJSON, normalizeLineEndings } from "../utils/json-utils.js";

function findMatchingBoundary(text: string, startIndex: number): number {
  const openChar = text[startIndex];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\" && inString) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === openChar) {
      depth += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function collectInlineCandidates(text: string): ExtractedCandidate[] {
  const candidates: ExtractedCandidate[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== "{" && char !== "[") {
      continue;
    }

    const end = findMatchingBoundary(text, index);
    if (end === -1) {
      continue;
    }

    const raw = text.slice(index, end + 1).trim();
    if (!looksLikeJSON(raw)) {
      continue;
    }

    candidates.push({
      raw,
      start: index,
      end,
      source: "inline",
    });

    index = end;
  }

  return candidates;
}

function collectCodeBlockCandidates(text: string): ExtractedCandidate[] {
  const normalized = normalizeLineEndings(text);
  const regex = /```(?:json|JSON)?\s*\n([\s\S]*?)\n```/g;
  const matches = [...normalized.matchAll(regex)];

  const candidates: ExtractedCandidate[] = [];
  for (const match of matches) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }

    const start = match.index ?? 0;
    candidates.push({
      raw,
      start,
      end: start + match[0].length - 1,
      source: "code-block",
    });
  }

  return candidates;
}

function collectXmlCandidates(text: string): ExtractedCandidate[] {
  const regex = /<json>\s*([\s\S]*?)\s*<\/json>/gi;
  const matches = [...text.matchAll(regex)];

  const candidates: ExtractedCandidate[] = [];
  for (const match of matches) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }

    const start = match.index ?? 0;
    candidates.push({
      raw,
      start,
      end: start + match[0].length - 1,
      source: "xml",
    });
  }

  return candidates;
}

export function extractJSONCandidates(text: string): ExtractedCandidate[] {
  const candidates = [
    ...collectCodeBlockCandidates(text),
    ...collectXmlCandidates(text),
    ...collectInlineCandidates(text),
  ];

  const trimmed = text.trim();
  if (looksLikeJSON(trimmed)) {
    candidates.push({
      raw: trimmed,
      start: text.indexOf(trimmed),
      end: text.indexOf(trimmed) + trimmed.length - 1,
      source: "entire",
    });
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.start}:${candidate.end}:${candidate.raw}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
