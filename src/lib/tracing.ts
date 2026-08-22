// Minimal OpenTelemetry helpers for the game's decision pipeline.
//
// These are safe no-ops when OpenTelemetry isn't registered (e.g. the vitest
// engine suite) — `trace.getTracer` then returns a no-op tracer and
// `propagation.inject` writes nothing for a root context.

import {
  context,
  propagation,
  trace,
  SpanStatusCode,
  type Attributes,
  type Span,
  type Tracer,
} from '@opentelemetry/api';
import type { LegalMove } from '@/engine/types';

let cached: Tracer | null = null;

function tracer(): Tracer {
  if (!cached) cached = trace.getTracer('thuruppu');
  return cached;
}

/**
 * Run `fn` inside a new span named `name`, seeded with `attrs`. The span is
 * the active context while `fn` runs, so nested `withSpan` calls and any
 * injected trace context become its children. Errors are recorded and the
 * span is ended automatically.
 */
export async function withSpan<T>(
  name: string,
  attrs: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer().startActiveSpan(name, async (span) => {
    if (attrs) span.setAttributes(attrs);
    try {
      return await fn(span);
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
}

/** Inject the active span's W3C trace context (traceparent/tracestate) into `headers`. */
export function injectTraceContext(headers: Record<string, string>): void {
  propagation.inject(context.active(), headers);
}

const SUIT_SYMBOL: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

/** Compact, human-readable summary of a move for trace attributes. */
export function describeMove(move: LegalMove): string {
  switch (move.type) {
    case 'bid':
      return `bid ${move.amount}`;
    case 'selectTrump':
    case 'playCard':
      return `${move.type} ${move.card.rank}${SUIT_SYMBOL[move.card.suit] ?? move.card.suit}`;
    default:
      return move.type;
  }
}
