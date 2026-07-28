/**
 * Network trap for Learn engine unit tests.
 * Any accidental outbound call to OpenAI / Anthropic / etc. fails the suite.
 */
const BLOCKED = [/openai\.com/i, /api\.openai/i, /anthropic\.com/i, /api\.anthropic/i, /googleapis\.com\/v1beta\/models/i];

function assertNotBlocked(input: RequestInfo | URL): void {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : 'url' in input
          ? String(input.url)
          : String(input);
  if (BLOCKED.some((re) => re.test(url))) {
    throw new Error(`Network trap: blocked outbound call to ${url}. Learn tests must not call LLMs.`);
  }
}

const originalFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  assertNotBlocked(input);
  return originalFetch(input, init);
}) as typeof fetch;
