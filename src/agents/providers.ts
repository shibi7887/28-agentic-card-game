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

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: 1000,
  };

  if (responseFormat) {
    body.response_format = responseFormat;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000); // 20s timeout

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
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('LLM returned empty response');
    }

    return content;
  } catch (error) {
    clearTimeout(timeout);
    if ((error as Error).name === 'AbortError') {
      throw new Error('LLM call timed out after 20 seconds');
    }
    throw error;
  }
}
