# llm-parser

[![npm version](https://img.shields.io/npm/v/llm-parser.svg?style=flat-square)](https://www.npmjs.com/package/llm-parser)
[![bundle size](https://img.shields.io/bundlephobia/minzip/llm-parser?style=flat-square&label=gzip)](https://bundlephobia.com/package/llm-parser)
![test coverage](https://img.shields.io/badge/coverage-95%25-brightgreen?style=flat-square)
[![license](https://img.shields.io/npm/l/llm-parser.svg?style=flat-square)](LICENSE)
[![zod peer](https://img.shields.io/badge/zod-%3E%3D3.25.0-blue?style=flat-square)](https://zod.dev)

**Type-safe LLM response parser with Zod schema validation.**  
Works with any AI SDK — OpenAI, Anthropic Claude, Google Gemini, or a raw string.

---

## The problem

LLM APIs return unstructured text. Even in "JSON mode", the response is wrapped in explanation, markdown fences, or is slightly malformed. You end up writing the same brittle extraction logic on every project:

```typescript
// ❌ What you're doing today
const raw = response.choices[0].message.content
const match = raw.match(/```json\n([\s\S]*?)\n```/)
const parsed = JSON.parse(match?.[1] ?? '{}') // any type, no validation
```

## The solution

```typescript
// ✅ With llm-parser
import { parseAI } from 'llm-parser'
import { z } from 'zod'

const schema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  score: z.number().min(0).max(1),
  keywords: z.array(z.string()),
})

const result = await parseAI(response, schema)
//    ^? { sentiment: 'positive' | 'negative' | 'neutral'; score: number; keywords: string[] }
```

---

## Features

- **Works with any SDK** — pass the raw response object from OpenAI, Claude, Gemini, or any other provider directly
- **Smart JSON extraction** — finds JSON inside markdown fences, XML tags, inline text, or the entire response
- **Auto-repair** — fixes common LLM mistakes: trailing commas, single quotes, unquoted keys, bare backslashes, truncated structures
- **Full type inference** — return type is exactly `z.infer<typeof schema>`, no `any`
- **Streaming support** — assembles chunks in real time and yields partial results as they arrive
- **Tiny** — 4.3 KB gzip, zero runtime dependencies (Zod is a peer dependency)

---

## Installation

```bash
npm install llm-parser zod
```

Requires `zod >= 3.25.0` (v4 also supported).

---

## Usage

### With OpenAI

```typescript
import OpenAI from 'openai'
import { parseAI } from 'llm-parser'
import { z } from 'zod'

const client = new OpenAI()

const SummarySchema = z.object({
  title: z.string(),
  points: z.array(z.string()),
  sentiment: z.enum(['positive', 'negative', 'neutral']),
})

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Summarize this article as JSON: ...' }],
})

const summary = await parseAI(response, SummarySchema)
console.log(summary.title)   // string
console.log(summary.points)  // string[]
```

### With Anthropic Claude

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { parseAI } from 'llm-parser'
import { z } from 'zod'

const client = new Anthropic()
const EntitySchema = z.object({
  entities: z.array(z.string()),
})

const response = await client.messages.create({
  model: 'claude-opus-4-5',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Extract entities as JSON: ...' }],
})

const result = await parseAI(response, EntitySchema)
```

### With Google Gemini

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'
import { parseAI } from 'llm-parser'
import { z } from 'zod'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })
const MySchema = z.object({
  id: z.number(),
  label: z.string(),
})

const response = await model.generateContent('Extract data as JSON: ...')

const result = await parseAI(response, MySchema)
```

### With a plain string

No SDK needed — pass any string directly:

```typescript
const raw = `Here is the analysis:
\`\`\`json
{"sentiment": "positive", "score": 0.92}
\`\`\`
Hope that helps!`

const result = await parseAI(raw, schema)
```

---

## Streaming

`streamAI` assembles chunks as they arrive and yields partial results in real time.

```typescript
import { streamAI } from 'llm-parser'
import { z } from 'zod'

const TaskListSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
    })
  ),
})

const stream = await client.chat.completions.create({
  model: 'gpt-4o',
  stream: true,
  messages: [{ role: 'user', content: 'List 5 tasks as JSON...' }],
})

for await (const partial of streamAI(stream, TaskListSchema)) {
  console.log(partial)
  // { tasks: undefined }
  // { tasks: [{ id: 1, title: 'Buy milk' }] }
  // { tasks: [{ id: 1, title: 'Buy milk' }, { id: 2, title: 'Walk dog' }] }  ← final
}
```

Disable partial emissions if you only want the final result:

```typescript
for await (const result of streamAI(stream, schema, { emitPartial: false })) {
  console.log(result) // only emitted once, fully validated
}
```

---

## Reusable parsers

`createParser` binds a schema and options together for repeated use:

```typescript
import { createParser } from 'llm-parser'

const sentimentParser = createParser(
  z.object({
    sentiment: z.enum(['positive', 'negative', 'neutral']),
    score: z.number(),
  }),
  { strategy: 'schema-match' }
)

const r1 = await sentimentParser.parse(response1)
const r2 = await sentimentParser.parse(response2)

// Streaming also available on the parser
for await (const partial of sentimentParser.stream(streamResponse)) {
  console.log(partial)
}
```

---

## Error handling

All errors are `ParseError` instances with a typed `code` field.

```typescript
import { parseAI, ParseError } from 'llm-parser'

try {
  const result = await parseAI(response, schema)
} catch (err) {
  if (err instanceof ParseError) {
    switch (err.code) {
      case 'INPUT_NORMALIZATION_FAILED':
        // Response could not be converted to text
        break
      case 'JSON_EXTRACT_FAILED':
        // No JSON-like content found in the response
        break
      case 'JSON_REPAIR_FAILED':
        // JSON was found but could not be parsed even after repair
        break
      case 'SCHEMA_VALIDATION_FAILED':
        // JSON parsed but did not match the schema
        console.log(err.message) // human-readable Zod error
        break
      case 'STREAM_TIMEOUT':
        // Stream exceeded the timeout option
        break
    }

    console.log(err.rawInput)   // the original text that was parsed
    console.log(err.extracted)  // the JSON string that was extracted (if any)
  }
}
```

### Fallback instead of throwing

Pass `fallback: true` to return `null` instead of throwing:

```typescript
const result = await parseAI(response, schema, { fallback: true })
//    ^? { sentiment: string; score: number } | null
if (result === null) {
  // handle parse failure
}
```

---

## Options

### `ParseOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `repair` | `boolean` | `true` | Attempt to fix malformed JSON before failing |
| `strategy` | `'first' \| 'largest' \| 'schema-match'` | `'first'` | How to pick when multiple JSON candidates are found |
| `fallback` | `boolean` | `false` | Return `null` instead of throwing on failure |
| `debug` | `boolean` | `false` | Attach parse stage logs to `ParseError.logs` |

### `StreamOptions`

Extends `ParseOptions` with:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `emitPartial` | `boolean` | `true` | Yield incomplete results as chunks arrive |
| `timeout` | `number` | `30000` | Milliseconds before throwing `STREAM_TIMEOUT` |

### Extraction strategies

| Strategy | Behaviour |
|----------|-----------|
| `'first'` | Use the first JSON candidate found (default, fastest) |
| `'largest'` | Use the largest JSON candidate by character count |
| `'schema-match'` | Try each candidate against the schema, use the first that passes |

`schema-match` is the most reliable when the response might contain multiple JSON objects (e.g. examples in a prompt echo).

---

## Auto-repair

The repair pipeline handles the most common LLM JSON mistakes:

| Input | Repaired |
|-------|----------|
| `{"a": 1,}` | `{"a": 1}` — trailing comma |
| `{'a': '1'}` | `{"a": "1"}` — single quotes |
| `{name: "Ada"}` | `{"name": "Ada"}` — unquoted keys |
| `{"a": undefined}` | `{"a": null}` — undefined values |
| `{"a": 1 // note}` | `{"a": 1}` — inline comments |
| `{"path": "C:\Users\"}` | `{"path": "C:\\Users\\"}` — bare backslashes |
| `{"name": "Ada"` | `{"name": "Ada"}` — truncated structure |

Set `repair: false` to disable and throw immediately on invalid JSON.

---

## Prompting tips

While the library handles messy output, you'll get the cleanest results by telling the model what you expect:

```
Respond with ONLY a JSON object in this exact format, no other text:
{
  "sentiment": "positive" | "negative" | "neutral",
  "score": <number between 0 and 1>,
  "keywords": [<array of strings>]
}
```

---

## API reference

### `parseAI(input, schema, options?)`

Parses a single LLM response against a Zod schema.

- **`input`** — `string | object` — raw string, or any AI SDK response object
- **`schema`** — `ZodTypeAny` — the Zod schema to validate against
- **`options`** — `ParseOptions` — optional configuration
- **Returns** `Promise<z.infer<typeof schema>>` (or `Promise<z.infer<typeof schema> | null>` when `fallback: true`)

### `streamAI(stream, schema, options?)`

Parses a streaming LLM response, yielding results as chunks arrive.

- **`stream`** — `AsyncIterable<unknown> | ReadableStream<unknown>` — any AI SDK stream
- **`schema`** — `ZodTypeAny`
- **`options`** — `StreamOptions`
- **Returns** `AsyncGenerator<Partial<z.infer<typeof schema>>>`

### `createParser(schema, options?)`

Creates a reusable parser bound to a schema and default options.

- **Returns** `{ parse(input): Promise<T>, stream(stream, options?): AsyncGenerator<Partial<T>> }`

### `ParseError`

Thrown on all parse failures. Fields: `code`, `message`, `rawInput`, `extracted`, `repaired`, `logs`.

---

## License

MIT
