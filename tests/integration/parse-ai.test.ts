import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createParser,
  ParseError,
  parseAI,
  streamAI,
} from "../../src/index.js";

describe("parseAI", () => {
  const schema = z.object({
    name: z.string(),
    age: z.number(),
  });

  it("parses a plain string response", async () => {
    const result = await parseAI('{"name":"Ada","age":36}', schema);
    expect(result).toEqual({ name: "Ada", age: 36 });
  });

  it("parses an OpenAI-like response", async () => {
    const response = {
      choices: [
        {
          message: {
            content: 'Answer:\n```json\n{"name":"Ada","age":36}\n```',
          },
        },
      ],
    };

    const result = await parseAI(response, schema);
    expect(result).toEqual({ name: "Ada", age: 36 });
  });

  it("parses a Claude SDK-like response", async () => {
    const response = {
      content: [
        {
          type: "text",
          text: 'Answer:\n```json\n{"name":"Ada","age":36}\n```',
        },
      ],
    };

    const result = await parseAI(response, schema);
    expect(result).toEqual({ name: "Ada", age: 36 });
  });

  it("parses a Gemini SDK-like response", async () => {
    const response = {
      candidates: [
        {
          content: {
            parts: [{ text: '{"name":"Ada","age":36}' }],
          },
        },
      ],
    };

    const result = await parseAI(response, schema);
    expect(result).toEqual({ name: "Ada", age: 36 });
  });

  it("repairs malformed JSON", async () => {
    const result = await parseAI("{name: 'Ada', age: 36,}", schema);
    expect(result).toEqual({ name: "Ada", age: 36 });
  });

  it("supports schema-match strategy", async () => {
    const input = 'prefix {"ignore": true} middle {"name":"Ada","age":36}';
    const result = await parseAI(input, schema, { strategy: "schema-match" });
    expect(result).toEqual({ name: "Ada", age: 36 });
  });

  it("throws ParseError when schema validation fails", async () => {
    await expect(parseAI('{"name":"Ada"}', schema)).rejects.toBeInstanceOf(
      ParseError
    );
  });

  it("returns null when fallback is enabled", async () => {
    await expect(
      parseAI("hello", schema, { fallback: true })
    ).resolves.toBeNull();
  });

  it("returns null when fallback is enabled for normalization failures", async () => {
    await expect(
      parseAI({ unsupported: true }, schema, { fallback: true })
    ).resolves.toBeNull();
  });

  it("keeps a non-null inferred return type without fallback", async () => {
    const result = await parseAI('{"name":"Ada","age":36}', schema);
    expect(result.name).toBe("Ada");
  });

  it("throws INPUT_NORMALIZATION_FAILED for unsupported inputs", async () => {
    await expect(parseAI({ unsupported: true }, schema)).rejects.toMatchObject({
      code: "INPUT_NORMALIZATION_FAILED",
    });
  });

  it("throws JSON_EXTRACT_FAILED when text contains no candidate and fallback is off", async () => {
    await expect(
      parseAI("hello", schema, { debug: true })
    ).rejects.toMatchObject({
      code: "JSON_EXTRACT_FAILED",
      logs: expect.arrayContaining([
        expect.objectContaining({ stage: "normalize" }),
      ]),
    });
  });

  it("throws JSON_REPAIR_FAILED when extraction succeeds but parsing cannot be repaired", async () => {
    await expect(parseAI('{"name": [1,,2]}', schema)).rejects.toMatchObject({
      code: "JSON_REPAIR_FAILED",
    });
  });

  it("returns null with fallback even when extracted payload is invalid", async () => {
    await expect(
      parseAI('{"name": [1,,2]}', schema, { fallback: true })
    ).resolves.toBeNull();
  });

  it("supports largest strategy", async () => {
    const input =
      'small {"skip":true} large {"name":"Ada Lovelace","age":36,"extra":"value"}';
    const result = await parseAI(input, schema, { strategy: "largest" });
    expect(result).toEqual({ name: "Ada Lovelace", age: 36 });
  });

  it("falls through to a later valid candidate with default strategy", async () => {
    const input = 'first {"ignore":true} second {"name":"Ada","age":36}';
    const result = await parseAI(input, schema);
    expect(result).toEqual({ name: "Ada", age: 36 });
  });

  it("records debug logs on parse errors", async () => {
    await expect(
      parseAI('{"name": [1,,2]}', schema, { debug: true })
    ).rejects.toMatchObject({
      code: "JSON_REPAIR_FAILED",
      logs: expect.arrayContaining([
        expect.objectContaining({ stage: "normalize" }),
        expect.objectContaining({ stage: "extract" }),
      ]),
    });
  });
});

describe("createParser", () => {
  it("reuses schema and options", async () => {
    const parser = createParser(
      z.object({
        ok: z.boolean(),
      })
    );

    const result = await parser.parse('{"ok":true}');
    expect(result).toEqual({ ok: true });
  });

  it("proxies stream() to streamAI", async () => {
    async function* makeBooleanStream() {
      yield '{"ok":';
      yield "true}";
    }

    const parser = createParser(
      z.object({
        ok: z.boolean(),
      })
    );

    const chunks: Array<Partial<{ ok: boolean }>> = [];
    for await (const value of parser.stream(makeBooleanStream())) {
      chunks.push(value);
    }

    expect(chunks.at(-1)).toEqual({ ok: true });
  });
});

describe("streamAI", () => {
  const schema = z.object({
    name: z.string(),
    age: z.number(),
  });

  async function* makeStream() {
    yield '{"name":"Ada",';
    yield '"age":36}';
  }

  async function* makeDeltaStream() {
    yield {
      choices: [
        {
          delta: {
            content: [{ type: "output_text", text: '{"name":"Ada",' }],
          },
        },
      ],
    };
    yield {
      choices: [
        {
          delta: {
            content: [{ type: "output_text", text: '"age":36}' }],
          },
        },
      ],
    };
  }

  it("yields the final parsed object from an async iterable", async () => {
    const chunks: Array<Partial<z.infer<typeof schema>>> = [];

    for await (const value of streamAI(makeStream(), schema)) {
      chunks.push(value);
    }

    expect(chunks.at(-1)).toEqual({ name: "Ada", age: 36 });
  });

  it("accepts SDK-style delta chunks", async () => {
    const chunks: Array<Partial<z.infer<typeof schema>>> = [];

    for await (const value of streamAI(makeDeltaStream(), schema)) {
      chunks.push(value);
    }

    expect(chunks.at(-1)).toEqual({ name: "Ada", age: 36 });
  });

  it("accepts ReadableStream inputs", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue('{"name":"Ada",');
        controller.enqueue('"age":36}');
        controller.close();
      },
    });

    const chunks: Array<Partial<z.infer<typeof schema>>> = [];
    for await (const value of streamAI(stream, schema)) {
      chunks.push(value);
    }

    expect(chunks.at(-1)).toEqual({ name: "Ada", age: 36 });
  });

  it("handles non-string chunks via String(chunk) fallback", async () => {
    const chunkA = { toString: () => '{"name":"Ada",' };
    const chunkB = { toString: () => '"age":36}' };

    async function* objectChunkStream() {
      yield chunkA;
      yield chunkB;
    }

    const chunks: Array<Partial<z.infer<typeof schema>>> = [];
    for await (const value of streamAI(objectChunkStream(), schema)) {
      chunks.push(value);
    }

    expect(chunks.at(-1)).toEqual({ name: "Ada", age: 36 });
  });

  it("supports schemas without partial() when emitPartial is disabled", async () => {
    async function* arrayStream() {
      yield "[";
      yield '{"name":"Ada","age":36}';
      yield "]";
    }

    const results: unknown[] = [];
    for await (const value of streamAI(arrayStream(), z.array(schema), {
      emitPartial: false,
    })) {
      results.push(value);
    }

    expect(results.at(-1)).toEqual([{ name: "Ada", age: 36 }]);
  });

  it("skips invalid partial objects until a valid one arrives", async () => {
    async function* invalidThenValidStream() {
      yield 'prefix {"age":"wrong"}';
      yield ' suffix {"name":"Ada","age":36}';
    }

    const chunks: Array<Partial<z.infer<typeof schema>>> = [];
    for await (const value of streamAI(invalidThenValidStream(), schema)) {
      chunks.push(value);
    }

    expect(chunks).toEqual([{ name: "Ada", age: 36 }]);
  });

  it("returns cleanly when a readable stream is already done", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });

    const consume = async () => {
      for await (const _value of streamAI(stream, schema)) {
      }
    };

    await expect(consume()).rejects.toMatchObject({
      code: "JSON_EXTRACT_FAILED",
    });
  });

  it("throws JSON_EXTRACT_FAILED when the stream ends without a valid payload", async () => {
    async function* invalidPayloadStream() {
      yield '{"name": [1,,2]}';
    }

    const consume = async () => {
      for await (const _value of streamAI(invalidPayloadStream(), schema, {
        repair: false,
      })) {
      }
    };

    await expect(consume()).rejects.toMatchObject({
      code: "JSON_EXTRACT_FAILED",
    });
  });

  it("throws STREAM_TIMEOUT when the stream is too slow", async () => {
    async function* slowStream() {
      await new Promise((resolve) => setTimeout(resolve, 100));
      yield '{"name":"Ada","age":36}';
    }

    const consume = async () => {
      for await (const _value of streamAI(slowStream(), schema, {
        timeout: 10,
      })) {
      }
    };

    await expect(consume()).rejects.toMatchObject({ code: "STREAM_TIMEOUT" });
  });
});
