# 📦 llm-output-parser — 완전 빌드 플랜

> **목표**: AI LLM 응답을 Zod 스키마로 타입세이프하게 파싱하는 npm 라이브러리
> **예상 개발 기간**: 2~3주 (혼자 개발 기준)
> **목표 GitHub Stars**: 1,000+

---

## 📋 목차

1. [라이브러리 개요 및 컨셉](#1-라이브러리-개요-및-컨셉)
2. [기술 스택 및 아키텍처](#2-기술-스택-및-아키텍처)
3. [폴더 구조](#3-폴더-구조)
4. [개발 단계별 상세 계획](#4-개발-단계별-상세-계획)
5. [핵심 모듈 상세 설계](#5-핵심-모듈-상세-설계)
6. [전체 API 설계](#6-전체-api-설계)
7. [검증 및 테스트 계획](#7-검증-및-테스트-계획)
8. [npm 배포 계획](#8-npm-배포-계획)
9. [마케팅 및 스타 획득 전략](#9-마케팅-및-스타-획득-전략)
10. [자주 나올 오류 및 해결법](#10-자주-나올-오류-및-해결법)

---

## 1. 라이브러리 개요 및 컨셉

### 문제 정의

LLM(ChatGPT, Claude, Gemini 등) API를 호출하면 응답이 아래처럼 온다:

```
물론이죠! 분석 결과입니다:

```json
{"sentiment": "positive", "score": 0.87, "keywords": ["좋아", "최고"]}
```

위와 같이 긍정적인 감정이 감지되었습니다.
```

이 응답에서 JSON을 꺼내서 쓰려면:
- 정규식으로 JSON 블록을 찾아야 함
- JSON.parse()가 실패하면 처리 불가
- 꺼낸 값이 `any` 타입이라 TypeScript 의미 없음
- 스트리밍 응답이면 청크 조립도 직접 해야 함

**→ 이걸 한 줄로 해결하는 게 이 라이브러리다.**

### 해결책 (1줄 요약)

```typescript
const result = await parseAI(response, MySchema)
// result는 MySchema 타입으로 완전히 추론됨
```

### 경쟁 라이브러리 분석

| 라이브러리 | 문제점 |
|---|---|
| `instructor` (JS) | 특정 AI SDK에 종속, 스트리밍 미지원 |
| `zod-gpt` | OpenAI만 지원, 유지보수 중단 |
| `langchain` output parsers | 너무 무거움, LangChain 종속 |
| **우리 라이브러리** | **AI SDK 무관, 경량, 스트리밍 지원, Zod 완전 호환** |

### 차별점

- ✅ 어떤 AI API 응답이든 파싱 가능 (OpenAI, Claude, Gemini, 로컬 모델 전부)
- ✅ 번들 사이즈 < 5KB (gzip)
- ✅ Zod v3 완전 호환
- ✅ 스트리밍 청크 실시간 파싱
- ✅ JSON이 망가졌을 때 자동 복구
- ✅ TypeScript 퍼스트 (타입 추론 100%)

---

## 2. 기술 스택 및 아키텍처

### 기술 스택

| 항목 | 선택 | 이유 |
|---|---|---|
| 언어 | TypeScript 5.x | 타입 추론이 핵심 기능 |
| 번들러 | tsup | 가장 간단한 TS 라이브러리 번들러 |
| 테스트 | Vitest | 빠르고 Vite 기반, ESM 지원 완벽 |
| 스키마 검증 | Zod (peer dependency) | 업계 표준 |
| JSON 복구 | 직접 구현 (의존성 없음) | 번들 사이즈 최소화 |
| 린터 | Biome | ESLint + Prettier 대체, 빠름 |
| CI/CD | GitHub Actions | 무료, 표준 |

### 아키텍처 개요

```
┌─────────────────────────────────────────────────┐
│                  Public API Layer                │
│  parseAI() / streamAI() / createParser()        │
└───────────────────┬─────────────────────────────┘
                    │
        ┌───────────▼───────────┐
        │    Extractor Module   │  ← AI 응답에서 JSON 위치 찾기
        │  (텍스트에서 JSON 추출) │
        └───────────┬───────────┘
                    │
        ┌───────────▼───────────┐
        │     Repair Module     │  ← 망가진 JSON 자동 복구
        │  (JSON 오류 자동 수정)  │
        └───────────┬───────────┘
                    │
        ┌───────────▼───────────┐
        │    Validator Module   │  ← Zod로 타입 검증 + 추론
        │  (Zod 스키마 검증)     │
        └───────────┬───────────┘
                    │
        ┌───────────▼───────────┐
        │    Stream Module      │  ← 스트리밍 전용 처리
        │  (청크 버퍼 조립)       │
        └───────────────────────┘
```

---

## 3. 폴더 구조

```
llm-output-parser/
├── src/
│   ├── index.ts              # 공개 API 진입점 (export 전부 여기서)
│   ├── core/
│   │   ├── extractor.ts      # JSON 추출 로직
│   │   ├── repairer.ts       # 망가진 JSON 복구 로직
│   │   ├── validator.ts      # Zod 검증 로직
│   │   └── streamer.ts       # 스트리밍 처리 로직
│   ├── parsers/
│   │   ├── parse-ai.ts       # 메인 parseAI() 함수
│   │   ├── stream-ai.ts      # 스트리밍용 streamAI() 함수
│   │   └── create-parser.ts  # 재사용 파서 팩토리
│   ├── types/
│   │   └── index.ts          # 공개 타입 정의
│   └── utils/
│       └── json-utils.ts     # JSON 관련 헬퍼
├── tests/
│   ├── unit/
│   │   ├── extractor.test.ts
│   │   ├── repairer.test.ts
│   │   ├── validator.test.ts
│   │   └── streamer.test.ts
│   ├── integration/
│   │   ├── openai.test.ts    # OpenAI 응답 형식 테스트
│   │   ├── claude.test.ts    # Claude 응답 형식 테스트
│   │   └── gemini.test.ts    # Gemini 응답 형식 테스트
│   └── e2e/
│       └── full-flow.test.ts # 전체 흐름 통합 테스트
├── examples/
│   ├── openai-example.ts
│   ├── claude-example.ts
│   ├── streaming-example.ts
│   └── advanced-example.ts
├── docs/
│   └── api-reference.md
├── .github/
│   └── workflows/
│       ├── ci.yml            # PR마다 테스트 실행
│       └── release.yml       # main 머지 시 npm 배포
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── biome.json
└── README.md
```

---

## 4. 개발 단계별 상세 계획

### Phase 0 — 프로젝트 세팅 (1일)

**Step 0-1: 패키지 초기화**

```bash
mkdir llm-output-parser
cd llm-output-parser
git init
npm init -y
```

**Step 0-2: 의존성 설치**

```bash
# devDependencies
npm install -D typescript tsup vitest @vitest/coverage-v8 biome

# peerDependencies (사용자가 이미 설치했을 가능성이 높음)
npm install -D zod
```

**Step 0-3: tsconfig.json 작성**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 0-4: tsup.config.ts 작성**

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],       // CommonJS + ESM 둘 다 지원
  dts: true,                    // .d.ts 타입 파일 생성
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: true,
  external: ['zod'],            // zod는 번들에 포함하지 않음 (peer dep)
  treeshake: true,
})
```

**Step 0-5: package.json 핵심 필드 설정**

```json
{
  "name": "llm-output-parser",
  "version": "0.1.0",
  "description": "Type-safe LLM response parser with Zod schema validation",
  "keywords": ["llm", "ai", "parser", "zod", "typescript", "openai", "claude", "gemini"],
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "peerDependencies": {
    "zod": ">=3.0.0"
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "biome check ./src",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run build && npm run test"
  }
}
```

---

### Phase 1 — 핵심 모듈 개발 (4~5일)

#### 1-1: Extractor 모듈

**목표**: AI 응답 텍스트에서 JSON 덩어리를 찾아내는 것

개발해야 할 추출 전략 (우선순위 순):
1. **코드블록 추출**: `` ```json {...} ``` `` 형태
2. **인라인 JSON 추출**: 텍스트 안에 `{...}` 또는 `[...]`가 섞인 형태
3. **XML 태그 추출**: `<json>{...}</json>` 형태 (일부 모델이 이 형태로 뱉음)
4. **전체 응답이 JSON**: 응답 자체가 순수 JSON인 경우

각 전략을 순서대로 시도하고, 성공하면 즉시 반환한다.

**구현 시 주의사항**:
- 중첩된 `{}` 브래킷을 올바르게 처리해야 함 (단순 정규식으로는 중첩 불가)
- 응답 안에 JSON이 여러 개 있을 경우 첫 번째가 아닌 스키마에 맞는 것을 선택
- 빈 객체 `{}` 나 배열 `[]`도 유효한 JSON으로 처리

---

#### 1-2: Repairer 모듈

**목표**: LLM이 자주 저지르는 JSON 실수를 자동으로 고치는 것

고쳐야 할 오류 목록 (빈도 높은 순):

| 오류 유형 | 예시 | 수정 방법 |
|---|---|---|
| Trailing comma | `{"a": 1,}` | 마지막 쉼표 제거 |
| Single quotes | `{'a': '1'}` | 쌍따옴표로 변환 |
| 따옴표 없는 키 | `{name: "철수"}` | 키에 쌍따옴표 추가 |
| 줄임 표시 | `{"items": [...]}` | 제거 or 빈 배열로 |
| 잘린 JSON | `{"name": "철` | 최대한 복구 시도 |
| 백슬래시 오류 | `{"path": "C:\Users"}` | 이스케이프 처리 |
| 주석 포함 | `{"a": 1 // comment}` | 주석 제거 |
| undefined 값 | `{"a": undefined}` | null로 대체 |

**복구 전략**:
1. 먼저 `JSON.parse()` 시도
2. 실패하면 위 오류들을 순서대로 고치면서 재시도
3. 그래도 실패하면 에러 throw (어떤 오류인지 메시지 포함)

---

#### 1-3: Validator 모듈

**목표**: 추출 + 복구된 JSON을 Zod 스키마로 검증하고 타입 추론

핵심 기능:
- `schema.safeParse()` 사용 (throw 대신 결과 반환)
- 실패 시 Zod 에러 메시지를 사람이 읽기 쉬운 형태로 변환
- `partial()` 모드 지원 (스트리밍 중간 상태 검증용)

---

#### 1-4: Streamer 모듈

**목표**: 스트리밍 응답 청크를 모아서 완성된 JSON을 조립

동작 방식:
```
청크1: '{"name":'     → 버퍼에 쌓기 (아직 불완전)
청크2: ' "철수",'     → 버퍼에 쌓기 (아직 불완전)
청크3: ' "age": 20}'  → 버퍼에 쌓기 → JSON 완성 감지 → 파싱 + 반환
```

**구현 포인트**:
- `ReadableStream`, `AsyncGenerator` 두 가지 입력 형식 지원
- 파싱 성공 전에도 partial 결과를 실시간으로 방출 (progressive parsing)
- 타임아웃 옵션 (무한 대기 방지)

---

### Phase 2 — Public API 개발 (2일)

#### 메인 함수 3개

**parseAI()** — 가장 기본적인 함수

```typescript
// 시그니처
async function parseAI<T extends ZodType>(
  input: string | AIResponse,    // 문자열 또는 AI SDK 응답 객체
  schema: T,                     // Zod 스키마
  options?: ParseOptions         // 선택적 옵션
): Promise<z.infer<T>>           // 스키마 타입으로 추론된 결과
```

**streamAI()** — 스트리밍 응답용

```typescript
// 시그니처
async function* streamAI<T extends ZodType>(
  stream: AsyncIterable<string>,  // AI SDK 스트림
  schema: T,
  options?: StreamOptions
): AsyncGenerator<Partial<z.infer<T>>>  // 부분 결과를 실시간으로 yield
```

**createParser()** — 재사용 가능한 파서 팩토리

```typescript
// 시그니처
function createParser<T extends ZodType>(
  schema: T,
  options?: ParseOptions
): {
  parse: (input: string) => Promise<z.infer<T>>
  stream: (stream: AsyncIterable<string>) => AsyncGenerator<Partial<z.infer<T>>>
}
```

---

### Phase 3 — 테스트 작성 (3일)

> **테스트를 늦게 쓰지 말 것. Phase 1, 2 개발과 동시에 작성한다.**

단계별 테스트 커버리지 목표:
- Phase 1 완료 시점: 유닛 테스트 80% 커버리지
- Phase 2 완료 시점: 통합 테스트 포함 90% 커버리지
- 배포 전: E2E 테스트 포함 95% 커버리지

---

### Phase 4 — 문서화 및 배포 준비 (2일)

작성할 문서:
- `README.md` (핵심! 스타를 얻는 건 README임)
- `docs/api-reference.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`

---

### Phase 5 — npm 배포 및 마케팅 (1~2일)

- npm 배포
- GitHub Releases 작성
- 커뮤니티 포스팅 (아래 섹션 참조)

---

## 5. 핵심 모듈 상세 설계

### 5-1: Extractor 상세 설계

```typescript
// src/core/extractor.ts

/**
 * AI 응답 텍스트에서 JSON 문자열을 추출한다
 * 여러 전략을 순서대로 시도하고 처음으로 성공한 결과를 반환
 */
export function extractJSON(text: string): string | null {
  // 전략 1: ```json ... ``` 코드블록
  const codeBlockResult = extractFromCodeBlock(text, 'json')
  if (codeBlockResult) return codeBlockResult

  // 전략 2: ``` ... ``` 코드블록 (언어 없음)
  const plainCodeBlockResult = extractFromCodeBlock(text, '')
  if (plainCodeBlockResult) return plainCodeBlockResult

  // 전략 3: XML 태그 <json>...</json>
  const xmlTagResult = extractFromXMLTag(text)
  if (xmlTagResult) return xmlTagResult

  // 전략 4: 중괄호 매칭으로 인라인 JSON 추출
  const inlineResult = extractInlineJSON(text)
  if (inlineResult) return inlineResult

  // 전략 5: 응답 전체가 JSON인 경우
  const trimmed = text.trim()
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return trimmed
  }

  return null
}

/**
 * 중첩된 브래킷을 올바르게 매칭해서 JSON 범위를 찾는다
 * 단순 정규식으로는 {"a": {"b": 1}} 같은 중첩 케이스를 처리할 수 없음
 */
function findJSONBoundary(text: string, startIndex: number): number {
  const openChar = text[startIndex]
  const closeChar = openChar === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i]

    if (escaped) { escaped = false; continue }
    if (char === '\\' && inString) { escaped = true; continue }
    if (char === '"') { inString = !inString; continue }
    if (inString) continue

    if (char === openChar) depth++
    if (char === closeChar) {
      depth--
      if (depth === 0) return i
    }
  }

  return -1 // 매칭되는 닫는 브래킷 없음
}
```

---

### 5-2: Repairer 상세 설계

```typescript
// src/core/repairer.ts

/**
 * 망가진 JSON 문자열을 복구 시도한다
 * 복구 불가능하면 null 반환
 */
export function repairJSON(input: string): string | null {
  // 1차 시도: 그대로 파싱
  try {
    JSON.parse(input)
    return input
  } catch {}

  let repaired = input

  // 수정 파이프라인: 각 함수가 순서대로 오류를 고침
  const repairs = [
    removeComments,           // // 주석, /* */ 주석 제거
    removeTrailingCommas,     // 마지막 쉼표 제거
    fixSingleQuotes,          // 작은따옴표 → 쌍따옴표
    fixUnquotedKeys,          // {name: "철수"} → {"name": "철수"}
    fixUndefinedValues,       // undefined → null
    fixTruncatedString,       // 잘린 문자열 닫기
    fixTruncatedJSON,         // 잘린 JSON 닫기 (마지막 수단)
  ]

  for (const repair of repairs) {
    repaired = repair(repaired)
    try {
      JSON.parse(repaired)
      return repaired           // 파싱 성공하면 즉시 반환
    } catch {}
  }

  return null                   // 모든 복구 실패
}

/**
 * Trailing comma 제거
 * 예: {"a": 1, "b": 2,} → {"a": 1, "b": 2}
 */
function removeTrailingCommas(json: string): string {
  // 문자열 내부의 쉼표는 건드리지 않도록 주의
  return json.replace(/,(\s*[}\]])/g, '$1')
}
```

---

### 5-3: ParseOptions 타입 설계

```typescript
// src/types/index.ts

export interface ParseOptions {
  /**
   * 파싱 실패 시 fallback 값 반환 여부
   * true: null 반환, false: 에러 throw (기본값: false)
   */
  fallback?: boolean

  /**
   * JSON 자동 복구 시도 여부 (기본값: true)
   */
  repair?: boolean

  /**
   * 여러 JSON이 있을 때 선택 전략
   * 'first': 첫 번째 (기본값)
   * 'largest': 가장 큰 것
   * 'schema-match': 스키마에 맞는 것
   */
  strategy?: 'first' | 'largest' | 'schema-match'

  /**
   * 파싱 과정 디버그 로그 출력 여부 (기본값: false)
   */
  debug?: boolean
}

export interface StreamOptions extends ParseOptions {
  /**
   * partial 결과를 방출할지 여부 (기본값: true)
   * true면 스트리밍 중간에도 불완전한 결과를 yield함
   */
  emitPartial?: boolean

  /**
   * 스트리밍 타임아웃 (ms, 기본값: 30000)
   */
  timeout?: number
}
```

---

## 6. 전체 API 설계

### 사용 예시 코드 (README에 들어갈 것)

```typescript
import { parseAI, streamAI, createParser } from 'llm-output-parser'
import { z } from 'zod'

// ────────────────────────────────────────────────
// 예시 1: 기본 파싱
// ────────────────────────────────────────────────

const SentimentSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  score: z.number().min(0).max(1),
  keywords: z.array(z.string()),
})

// OpenAI 응답
const openAIResponse = await openai.chat.completions.create({ ... })
const result = await parseAI(openAIResponse, SentimentSchema)

// result.sentiment → 'positive' (타입: 'positive' | 'negative' | 'neutral')
// result.score     → 0.87       (타입: number)
// result.keywords  → ['좋아']   (타입: string[])


// ────────────────────────────────────────────────
// 예시 2: Claude 응답
// ────────────────────────────────────────────────

const claudeResponse = await anthropic.messages.create({ ... })
const result = await parseAI(claudeResponse, SentimentSchema)
// 완전히 동일하게 동작


// ────────────────────────────────────────────────
// 예시 3: 원시 문자열도 OK
// ────────────────────────────────────────────────

const rawText = `분석 결과: \`\`\`json
{"sentiment": "positive", "score": 0.87, "keywords": ["좋아"]}
\`\`\``

const result = await parseAI(rawText, SentimentSchema)


// ────────────────────────────────────────────────
// 예시 4: 스트리밍
// ────────────────────────────────────────────────

const stream = await openai.chat.completions.create({
  stream: true,
  ...
})

for await (const partial of streamAI(stream, SentimentSchema)) {
  console.log(partial)
  // 실시간으로 업데이트:
  // { sentiment: undefined, score: undefined }
  // { sentiment: 'positive', score: undefined }
  // { sentiment: 'positive', score: 0.87, keywords: ['좋아'] }  ← 완성
}


// ────────────────────────────────────────────────
// 예시 5: 재사용 파서 (같은 스키마 반복 사용 시)
// ────────────────────────────────────────────────

const sentimentParser = createParser(SentimentSchema, {
  repair: true,
  strategy: 'schema-match',
})

const result1 = await sentimentParser.parse(response1)
const result2 = await sentimentParser.parse(response2)


// ────────────────────────────────────────────────
// 예시 6: 배열 스키마
// ────────────────────────────────────────────────

const TaskListSchema = z.array(z.object({
  id: z.number(),
  title: z.string(),
  done: z.boolean(),
}))

const tasks = await parseAI(response, TaskListSchema)
// tasks → [{ id: 1, title: "공부", done: false }, ...]


// ────────────────────────────────────────────────
// 예시 7: 에러 핸들링
// ────────────────────────────────────────────────

try {
  const result = await parseAI(response, MySchema)
} catch (error) {
  if (error instanceof ParseError) {
    console.log(error.code)       // 'JSON_EXTRACT_FAILED' | 'JSON_REPAIR_FAILED' | 'SCHEMA_VALIDATION_FAILED'
    console.log(error.rawInput)   // 원본 AI 응답 텍스트
    console.log(error.extracted)  // 추출 시도한 JSON (있으면)
  }
}
```

---

## 7. 검증 및 테스트 계획

### 7-1: 유닛 테스트 목록

#### Extractor 테스트

```typescript
// tests/unit/extractor.test.ts
describe('extractJSON', () => {
  it('```json 코드블록에서 추출', () => {
    const input = '결과입니다:\n```json\n{"a": 1}\n```\n감사합니다.'
    expect(extractJSON(input)).toBe('{"a": 1}')
  })

  it('언어 없는 코드블록에서 추출', () => {
    const input = '```\n{"a": 1}\n```'
    expect(extractJSON(input)).toBe('{"a": 1}')
  })

  it('인라인 JSON 추출', () => {
    const input = '값은 {"a": 1} 입니다'
    expect(extractJSON(input)).toBe('{"a": 1}')
  })

  it('중첩된 JSON 올바르게 추출', () => {
    const input = '{"a": {"b": {"c": 1}}}'
    expect(extractJSON(input)).toBe('{"a": {"b": {"c": 1}}}')
  })

  it('배열 JSON 추출', () => {
    const input = '아이템들: [1, 2, 3]'
    expect(extractJSON(input)).toBe('[1, 2, 3]')
  })

  it('JSON 없으면 null 반환', () => {
    expect(extractJSON('그냥 텍스트입니다')).toBeNull()
  })
})
```

#### Repairer 테스트

```typescript
// tests/unit/repairer.test.ts
describe('repairJSON', () => {
  it('Trailing comma 제거', () => {
    const result = repairJSON('{"a": 1,}')
    expect(JSON.parse(result!)).toEqual({ a: 1 })
  })

  it('작은따옴표 수정', () => {
    const result = repairJSON("{'a': '1'}")
    expect(JSON.parse(result!)).toEqual({ a: '1' })
  })

  it('따옴표 없는 키 수정', () => {
    const result = repairJSON('{name: "철수"}')
    expect(JSON.parse(result!)).toEqual({ name: '철수' })
  })

  it('주석 제거', () => {
    const result = repairJSON('{"a": 1 // 주석\n}')
    expect(JSON.parse(result!)).toEqual({ a: 1 })
  })

  it('복구 불가 JSON은 null 반환', () => {
    expect(repairJSON('완전히 망가진 텍스트')).toBeNull()
  })
})
```

#### 통합 테스트: 실제 AI 응답 형식

```typescript
// tests/integration/openai.test.ts
describe('OpenAI 응답 형식 파싱', () => {
  const schema = z.object({ name: z.string(), age: z.number() })

  it('JSON 모드 응답 (깔끔한 JSON)', async () => {
    const response = { choices: [{ message: { content: '{"name": "철수", "age": 20}' } }] }
    const result = await parseAI(response, schema)
    expect(result).toEqual({ name: '철수', age: 20 })
  })

  it('설명 텍스트 + JSON 섞인 응답', async () => {
    const response = {
      choices: [{
        message: {
          content: '분석 결과입니다!\n```json\n{"name": "철수", "age": 20}\n```\n위와 같습니다.'
        }
      }]
    }
    const result = await parseAI(response, schema)
    expect(result).toEqual({ name: '철수', age: 20 })
  })

  it('망가진 JSON 자동 복구', async () => {
    const response = { choices: [{ message: { content: '{name: "철수", age: 20,}' } }] }
    const result = await parseAI(response, schema)
    expect(result).toEqual({ name: '철수', age: 20 })
  })
})
```

### 7-2: 검증 체크리스트

배포 전 반드시 확인할 항목들:

- [ ] `npm run build` — 빌드 성공
- [ ] `npm run typecheck` — TypeScript 에러 없음
- [ ] `npm run test` — 전체 테스트 통과
- [ ] `npm run test:coverage` — 커버리지 95% 이상
- [ ] `npm run lint` — 린트 에러 없음
- [ ] **번들 사이즈 확인**: `ls -la dist/` 에서 .mjs 파일이 5KB 이하인지 확인
- [ ] **타입 추론 확인**: VSCode에서 결과값에 마우스 올렸을 때 타입이 올바르게 추론되는지 확인
- [ ] **ESM/CJS 둘 다 동작 확인**:
  ```bash
  # CJS 테스트
  node -e "const { parseAI } = require('./dist/index.js'); console.log(typeof parseAI)"

  # ESM 테스트
  node --input-type=module -e "import { parseAI } from './dist/index.mjs'; console.log(typeof parseAI)"
  ```
- [ ] **peer dependency 경고 없는지 확인**: `npm install` 후 경고 메시지 없음
- [ ] **examples 폴더 코드 실제 실행 확인**

### 7-3: 성능 벤치마크

목표 성능:
- 단순 JSON 파싱: 1ms 이하
- 텍스트에서 JSON 추출 + 파싱: 5ms 이하
- JSON 복구 + 파싱: 10ms 이하

---

## 8. npm 배포 계획

### 8-1: 버전 전략

| 버전 | 내용 | 시점 |
|---|---|---|
| 0.1.0 | MVP: parseAI, 기본 추출/복구 | 개발 완료 직후 |
| 0.2.0 | streamAI 추가 | MVP 배포 1주 후 |
| 0.3.0 | createParser, 고급 옵션 추가 | 0.2.0 배포 1주 후 |
| 1.0.0 | API 안정화, 완전한 문서화 | 커뮤니티 피드백 반영 후 |

### 8-2: npm 배포 명령어

```bash
# 최초 배포
npm login
npm publish --access public

# 이후 버전 업
npm version patch    # 버그 수정: 0.1.0 → 0.1.1
npm version minor    # 기능 추가: 0.1.0 → 0.2.0
npm version major    # 파괴적 변경: 0.x.x → 1.0.0
npm publish
```

### 8-3: GitHub Actions CI/CD 설정

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## 9. 마케팅 및 스타 획득 전략

### 9-1: README 작성 전략 (가장 중요)

README는 라이브러리의 얼굴이다. 스타를 얻는 건 코드가 아니라 README다.

**필수 포함 요소**:
1. **첫 3줄에 문제+해결책** — 스크롤 없이 바로 이해돼야 함
2. **Before/After 코드 비교** — "이걸 왜 써야 하냐"를 시각적으로 보여줌
3. **5분 안에 따라할 수 있는 Quick Start**
4. **모든 주요 AI API 예시 코드** (OpenAI, Claude, Gemini)
5. **번들 사이즈, 테스트 커버리지 배지**

**README 상단 배지 예시**:
```markdown
[![npm version](https://img.shields.io/npm/v/llm-output-parser.svg)](https://npmjs.com/package/llm-output-parser)
[![bundle size](https://img.shields.io/bundlephobia/minzip/llm-output-parser)](https://bundlephobia.com/package/llm-output-parser)
[![test coverage](https://img.shields.io/codecov/c/github/yourname/llm-output-parser)](https://codecov.io/gh/yourname/llm-output-parser)
[![license](https://img.shields.io/npm/l/llm-output-parser.svg)](LICENSE)
```

### 9-2: 커뮤니티 포스팅 계획

배포 후 아래 순서로 올릴 것:

1. **Reddit** `r/node`, `r/typescript`, `r/ChatGPT` — 영어로 작성, Before/After 코드 필수
2. **Hacker News** — "Show HN: A type-safe LLM response parser for any AI API" 형태
3. **Dev.to** — 블로그 포스트 형태, "How I built X" 스토리텔링
4. **Twitter/X** — 짧은 Before/After + GIF 시연
5. **한국 커뮤니티** — 개발자 카카오톡 오픈채팅, okky.kr, velog

### 9-3: 스타 획득에 효과적인 방법

- **다른 유명 라이브러리 이슈에서 언급**: `zod`, `openai` repo에서 관련 이슈 찾아서 정중하게 언급
- **유명 AI 관련 awesome 리스트에 PR 제출**: `awesome-llm`, `awesome-typescript` 등
- **npm 키워드 최적화**: package.json keywords에 `llm`, `openai`, `claude`, `zod`, `typescript`, `parser`, `streaming` 포함

---

## 10. 자주 나올 오류 및 해결법

### 빌드 관련

| 오류 | 원인 | 해결 |
|---|---|---|
| `Cannot find module 'zod'` | peerDep 미설치 | `npm install zod` |
| `Type instantiation is excessively deep` | Zod 타입 추론 한계 | 스키마 단순화 or `z.any()` 사용 |
| ESM/CJS 혼용 오류 | 번들 설정 문제 | tsup.config.ts의 `format` 확인 |

### 파싱 관련

| 오류 | 원인 | 해결 |
|---|---|---|
| `JSON_EXTRACT_FAILED` | AI 응답에 JSON 없음 | 프롬프트에 "JSON으로만 답변해줘" 추가 |
| `SCHEMA_VALIDATION_FAILED` | AI가 스키마 구조 안 지킴 | 프롬프트에 스키마 명시 |
| 스트리밍 타임아웃 | AI 응답 너무 느림 | `timeout` 옵션 값 늘리기 |

### 프롬프트 권장 패턴

이 라이브러리를 가장 잘 활용하려면 AI 프롬프트에 아래를 추가하는 것을 문서에 명시할 것:

```
아래 JSON 형식으로만 답변해주세요. 다른 텍스트는 포함하지 마세요:
{
  "sentiment": "positive" | "negative" | "neutral",
  "score": 0~1 사이의 숫자,
  "keywords": ["키워드 배열"]
}
```

---

## ✅ 최종 체크리스트

### 개발 완료 전 확인

- [ ] 모든 유닛 테스트 통과
- [ ] 모든 통합 테스트 통과
- [ ] TypeScript strict 모드에서 에러 없음
- [ ] 번들 사이즈 5KB 이하 (gzip 기준)
- [ ] ESM + CJS 둘 다 import 테스트 통과
- [ ] README의 모든 예시 코드 실제 실행 확인
- [ ] API 문서 완성

### 배포 후 확인

- [ ] `npm install llm-output-parser` 정상 동작
- [ ] 패키지 페이지 (npmjs.com) 정상 표시
- [ ] GitHub Release 노트 작성
- [ ] 첫 커뮤니티 포스팅 완료

---

> **마지막 조언**: 처음부터 완벽하게 만들려 하지 말 것. 0.1.0은 `parseAI()` 하나만 잘 동작해도 된다. 배포하고, 피드백 받고, 개선하는 것이 오픈소스의 정석이다.
