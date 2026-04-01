import { describe, expect, it } from "vitest";
import { extractJSONCandidates } from "../../src/core/extractor.js";

describe("extractJSONCandidates", () => {
  it("extracts JSON from a json code block", () => {
    const input = 'Result:\n```json\n{"a": 1}\n```\nDone.';
    expect(extractJSONCandidates(input)[0]?.raw).toBe('{"a": 1}');
  });

  it("extracts inline nested JSON", () => {
    const input = 'Value {"a":{"b":[1,2,3]}} end';
    expect(extractJSONCandidates(input)[0]?.raw).toBe('{"a":{"b":[1,2,3]}}');
  });

  it("extracts arrays", () => {
    const input = "Items: [1, 2, 3]";
    expect(extractJSONCandidates(input)[0]?.raw).toBe("[1, 2, 3]");
  });

  it("extracts JSON from xml tags", () => {
    const input = '<json>\n{"a": 1}\n</json>';
    expect(extractJSONCandidates(input)[0]?.raw).toBe('{"a": 1}');
  });

  it("deduplicates identical inline and entire-payload matches", () => {
    const input = '{"a": {"quoted": "brace } inside string"}}';
    const candidates = extractJSONCandidates(input);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.raw).toBe(input);
  });

  it("ignores incomplete json candidates", () => {
    const input = 'prefix {"a": 1';
    expect(extractJSONCandidates(input)).toEqual([]);
  });

  it("returns an empty list when JSON is missing", () => {
    expect(extractJSONCandidates("plain text")).toEqual([]);
  });
});
