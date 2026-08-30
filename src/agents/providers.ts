// LLM Provider abstraction — maps provider configs to OpenAI-compatible API calls

import { injectTraceContext, withSpan } from '@/lib/tracing';

export interface ProviderConfig {
  baseURL: string;
  apiKey: string;
  headers?: Record<string, string>;
}

export function getProviderConfig(provider: string): ProviderConfig {
  switch (provider) {
    case 'openai':
      return {
        baseURL: 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY || '',
      };
    case 'deepseek':
      return {
        baseURL: 'https://api.deepseek.com/v1',
        apiKey: process.env.DEEPSEEK_API_KEY || '',
      };
    case 'ollama':
      return {
        baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
        apiKey: process.env.OLLAMA_API_KEY || 'ollama', // Ollama needs no key; dummy value
      };
    case 'sglang':
      return {
        baseURL: process.env.SGLANG_BASE_URL || 'http://localhost:30000/v1',
        apiKey: process.env.SGLANG_API_KEY || 'EMPTY', // SGLang needs no key; dummy value
      };
    case 'vllm':
      return {
        baseURL: process.env.VLLM_BASE_URL || 'http://localhost:8000/v1',
        apiKey: process.env.VLLM_API_KEY || 'EMPTY', // vLLM needs no key by default
      };
    case 'openrouter':
      return {
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY || '',
        headers: {
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
          'X-Title': 'Thuruppu Card Game',
        },
      };
    default:
      // Default to OpenRouter as fallback (supports most models)
      return {
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY || '',
        headers: {
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
          'X-Title': 'Thuruppu Card Game',
        },
      };
  }
}

export async function callLLM(
  provider: string,
  model: string,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  temperature: number = 0.3,
  responseFormat?: { type: 'json_object' },
  attempt: number = 1,
): Promise<string> {
  const config = getProviderConfig(provider);

  if (!config.apiKey) {
    throw new Error(`No API key configured for provider: ${provider}`);
  }

  // Timeout: configurable, longer default for local models
  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS || '') || 120000;
  const maxTokens = parseInt(process.env.LLM_MAX_TOKENS || '') || 4096;

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  // Reasoning models served by SGLang/vLLM (e.g. gpt-oss-20b) emit their
  // chain-of-thought into `content`; SGLang's json_object constrained decoding
  // then returns a stub `{}` instead of the requested JSON. Skip json_object
  // for these local reasoning backends and rely on the prompt + robust JSON
  // extraction in pipeline.ts. Cloud providers keep it (mature support).
  const JSON_FORMAT_BACKENDS = new Set(['openai', 'deepseek', 'openrouter', 'ollama']);
  const force = process.env.LLM_JSON_RESPONSE_FORMAT;
  const sendJsonFormat =
    !!responseFormat &&
    (force === 'always' || (force !== 'never' && JSON_FORMAT_BACKENDS.has(provider)));
  if (sendJsonFormat) {
    body.response_format = responseFormat;
  }

  // Disable "thinking" mode by default so reasoning tokens don't consume the
  // token budget or delay the answer. Set LLM_ENABLE_THINKING=true to keep
  // chain-of-thought for local thinking models (e.g. Qwen3).
  const enableThinking = (process.env.LLM_ENABLE_THINKING || 'false').toLowerCase() === 'true';
  if (!enableThinking) {
    if (provider === 'ollama') {
      body.think = false;
    } else if (provider === 'sglang' || provider === 'vllm') {
      // Merge (never overwrite) so a later reasoning_effort block can't
      // clobber enable_thinking — otherwise Qwen3 silently falls back to full
      // chain-of-thought and every request slows to tens of seconds.
      body.chat_template_kwargs = { ...(body.chat_template_kwargs || {}), enable_thinking: false };
    }
  }

  // gpt-oss reasoning effort (SGLang/vLLM): reduces the chain-of-thought the
  // model emits, cutting generation latency. Valid: minimal | low | medium |
  // high. Set LLM_REASONING_EFFORT to opt in (default is the model's "medium").
  // NOTE: this is a gpt-oss-20b knob only. Qwen3's chat template ignores it, so
  // setting it with Qwen3 is a no-op — keep it unset (or use LLM_ENABLE_THINKING=false).
  const reasoningEffort = process.env.LLM_REASONING_EFFORT;
  if ((provider === 'sglang' || provider === 'vllm') && reasoningEffort) {
    body.chat_template_kwargs = { ...(body.chat_template_kwargs || {}), reasoning_effort: reasoningEffort };
  }

  // One span per HTTP call. Nested under the caller's `agent.decision` span;
  // its W3C trace context is injected into the request so the backend
  // (e.g. SGLang) nests its own spans under this one in Jaeger.
  return withSpan(
    'llm.call',
    {
      'llm.provider': provider,
      'llm.model': model,
      'llm.base_url': config.baseURL,
      'llm.temperature': temperature,
      'llm.attempt': attempt,
    },
    async (span) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const started = Date.now();

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          ...config.headers,
        };
        injectTraceContext(headers);

        const response = await fetch(`${config.baseURL}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);
        span.setAttribute('http.response.status_code', response.status);
        span.setAttribute('llm.duration_ms', Date.now() - started);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`LLM call failed (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const message = data.choices?.[0]?.message;
        let content: string | undefined = message?.content;

        // Some thinking models return the answer in reasoning_content when `content` is empty.
        if (!content && typeof message?.reasoning_content === 'string') {
          content = message.reasoning_content;
        }

        if (!content || typeof content !== 'string' || content.trim() === '') {
          throw new Error(
            'LLM returned empty response — this often happens with "thinking" models that use all tokens on reasoning. Use a non-thinking model or set LLM_MAX_TOKENS higher.'
          );
        }

        return content;
      } catch (error) {
        clearTimeout(timeout);
        if ((error as Error).name === 'AbortError') {
          throw new Error(`LLM call timed out after ${timeoutMs}ms`);
        }
        throw error;
      }
    }
  );
}
