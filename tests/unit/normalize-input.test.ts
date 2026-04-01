import { describe, expect, it } from "vitest";
import { normalizeAIResponse } from "../../src/core/normalize-input.js";

describe("normalizeAIResponse", () => {
  it("normalizes a plain string", () => {
    expect(normalizeAIResponse('{"ok":true}')).toEqual({ text: '{"ok":true}' });
  });

  it("normalizes Claude content arrays", () => {
    const response = {
      id: "msg_123",
      content: [
        { type: "text", text: '```json\n{"name":"Ada","age":36}\n```' },
      ],
    };

    expect(normalizeAIResponse(response)).toEqual({
      text: '```json\n{"name":"Ada","age":36}\n```',
    });
  });

  it("normalizes Gemini candidates content parts", () => {
    const response = {
      candidates: [
        {
          content: {
            role: "model",
            parts: [{ text: '{"name":"Ada","age":36}' }],
          },
        },
      ],
    };

    expect(normalizeAIResponse(response)).toEqual({
      text: '{"name":"Ada","age":36}',
    });
  });

  it("normalizes nested streaming deltas", () => {
    const response = {
      choices: [
        {
          delta: {
            content: [{ type: "output_text", text: '{"name":"Ada"' }],
          },
        },
      ],
    };

    expect(normalizeAIResponse(response)).toEqual({
      text: '{"name":"Ada"',
    });
  });

  it("joins arrays of text-bearing blocks", () => {
    const response = {
      content: [
        { type: "text", text: "first" },
        { type: "text", text: "second" },
      ],
    };

    expect(normalizeAIResponse(response)).toEqual({
      text: "first\nsecond",
    });
  });

  it("returns null when no text is discoverable", () => {
    expect(normalizeAIResponse({ content: [{ type: "tool_use" }] })).toBeNull();
  });
});
