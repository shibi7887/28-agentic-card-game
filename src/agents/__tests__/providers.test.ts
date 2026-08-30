// LLM provider request-body tests — guards the chat_template_kwargs merge.
// Regression: reasoning_effort must NOT clobber enable_thinking:false, or
// Qwen3 silently falls back to full chain-of-thought (tens of seconds/move).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { callLLM } from '../providers';

const ORIGINAL_ENV = { ...process.env };

function mockFetch(capture: (body: Record<string, unknown>) => void) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      capture(JSON.parse(String(init?.body)));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: '{"action":"pass"}' } }],
        }),
      };
    }),
  );
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.VLLM_BASE_URL = 'http://localhost:30001/v1';
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = ORIGINAL_ENV;
});

describe('callLLM chat_template_kwargs (vllm)', () => {
  it('disables thinking by default (enable_thinking:false)', async () => {
    let sent: Record<string, unknown> = {};
    mockFetch((b) => (sent = b));

    await callLLM('vllm', 'Qwen/Qwen3-8B', [{ role: 'user', content: 'hi' }], 0.0);

    expect(sent.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it('keeps enable_thinking:false when reasoning_effort is also set', async () => {
    process.env.LLM_REASONING_EFFORT = 'low';
    let sent: Record<string, unknown> = {};
    mockFetch((b) => (sent = b));

    await callLLM('vllm', 'openai/gpt-oss-20b', [{ role: 'user', content: 'hi' }], 0.0);

    expect(sent.chat_template_kwargs).toEqual({
      enable_thinking: false,
      reasoning_effort: 'low',
    });
  });

  it('omits enable_thinking when LLM_ENABLE_THINKING=true, keeps reasoning_effort', async () => {
    process.env.LLM_ENABLE_THINKING = 'true';
    process.env.LLM_REASONING_EFFORT = 'medium';
    let sent: Record<string, unknown> = {};
    mockFetch((b) => (sent = b));

    await callLLM('vllm', 'openai/gpt-oss-20b', [{ role: 'user', content: 'hi' }], 0.0);

    expect(sent.chat_template_kwargs).toEqual({ reasoning_effort: 'medium' });
  });

  it('sends reasoning_effort for gpt-oss without clobbering anything', async () => {
    process.env.LLM_REASONING_EFFORT = 'minimal';
    let sent: Record<string, unknown> = {};
    mockFetch((b) => (sent = b));

    await callLLM('vllm', 'openai/gpt-oss-20b', [{ role: 'user', content: 'hi' }], 0.0);

    expect(sent.chat_template_kwargs).toEqual({
      enable_thinking: false,
      reasoning_effort: 'minimal',
    });
  });
});
