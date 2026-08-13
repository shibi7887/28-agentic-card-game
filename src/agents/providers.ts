// LLM Provider abstraction — maps provider configs to OpenAI-compatible API calls

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

  if (responseFormat) {
    body.response_format = responseFormat;
  }

  // Ollama: disable "thinking" mode if the model supports it, so reasoning
  // tokens don't consume the budget or delay the answer.
  if (provider === 'ollama') {
    body.think = false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        ...config.headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

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
