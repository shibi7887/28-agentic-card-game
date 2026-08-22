// OpenTelemetry bootstrap for the Thuruppu Next.js server.
//
// Next.js runs `register()` once on server start, before any request is
// handled (see https://nextjs.org/docs/app/guides/instrumentation). It wires
// up the SDK, W3C trace-context propagation, and an OTLP exporter configured
// entirely via the OTEL_* environment variables (see .env.example).

import { registerOTel } from '@vercel/otel';

export function register() {
  // Opt-out switch for local runs without a collector reachable.
  if (process.env.OTEL_ENABLED === 'false') return;

  registerOTel({
    serviceName: 'thuruppu',
    instrumentationConfig: {
      fetch: {
        // Propagate W3C trace context to the local LLM backends so their spans
        // (e.g. SGLang) nest under this app's spans in Jaeger. The callLLM
        // path also injects trace context explicitly as a fallback, so these
        // are a best-effort addition.
        propagateContextUrls: [
          /30000/, // SGLang
          /8000/, // vLLM
          /11434/, // Ollama
          /10\.0\.0\.213/, // remote backend host
        ],
      },
    },
  });
}
