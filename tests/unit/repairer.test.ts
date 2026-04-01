import { describe, expect, it } from "vitest";
import { repairJSON } from "../../src/core/repairer.js";

describe("repairJSON", () => {
  it("removes trailing commas", () => {
    const repaired = repairJSON('{"a": 1,}');
    expect(repaired).toBe('{"a": 1}');
  });

  it("fixes single quotes and bare keys", () => {
    const repaired = repairJSON("{name: 'Ada'}");
    expect(repaired).toBe('{"name": "Ada"}');
  });

  it("removes comments", () => {
    const repaired = repairJSON('{"a": 1 // comment\n}');
    expect(repaired).toBe('{"a": 1 \n}');
  });

  it("closes truncated strings and objects", () => {
    const repaired = repairJSON('{"name": "Ada');
    expect(repaired).toBe('{"name": "Ada"}');
    expect(JSON.parse(repaired ?? "null")).toEqual({ name: "Ada" });
  });

  it("closes truncated nested structures", () => {
    const repaired = repairJSON('{"user": {"name": "Ada"}, "tags": ["a", "b"');
    expect(repaired).toBe('{"user": {"name": "Ada"}, "tags": ["a", "b"]}');
    expect(JSON.parse(repaired ?? "null")).toEqual({
      user: { name: "Ada" },
      tags: ["a", "b"],
    });
  });

  it("escapes bare backslashes inside strings", () => {
    const repaired = repairJSON('{"path": "C:\\Users\\Ada\\Desktop"}');
    expect(repaired).toBe('{"path": "C:\\\\Users\\\\Ada\\\\Desktop"}');
    expect(JSON.parse(repaired ?? "null")).toEqual({
      path: "C:\\Users\\Ada\\Desktop",
    });
  });

  it("repairs a trailing backslash before a closing quote", () => {
    const repaired = repairJSON('{"path": "C:\\Users\\"}');
    expect(repaired).toBe('{"path": "C:\\\\Users\\\\"}');
    expect(JSON.parse(repaired ?? "null")).toEqual({
      path: "C:\\Users\\",
    });
  });

  it("handles escaped backslashes while closing truncated structures", () => {
    const repaired = repairJSON(
      '{"text":"escaped brace \\\\{ still string","items":[1,2]'
    );
    expect(repaired).toBe(
      '{"text":"escaped brace \\\\{ still string","items":[1,2]}'
    );
    expect(JSON.parse(repaired ?? "null")).toEqual({
      text: "escaped brace \\{ still string",
      items: [1, 2],
    });
  });

  it("returns null for irreparable input", () => {
    expect(repairJSON("not json at all")).toBeNull();
  });
});
