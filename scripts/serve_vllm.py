#!/usr/bin/env python3
"""Serve a model with vLLM for the Thuruppu game (OpenAI-compatible endpoint).

Invoked by `scripts/serve-vllm.sh`, which sanitizes the environment and points
at the dedicated `.venv-vllm` (vLLM and SGLang have incompatible torch pins).

Usage (via the wrapper — positional [model] [port] are translated by the shell):
    ./scripts/serve-vllm.sh Qwen/Qwen3-8B 8000
    ./scripts/serve-vllm.sh Qwen/Qwen3-14B-AWQ 8000 --quantization awq

All args after the wrapper's translation are vLLM's native OpenAI-server CLI
flags (--model, --port, --quantization, --gpu-memory-utilization, ...).
"""

from __future__ import annotations

import sys
import asyncio

from vllm.entrypoints.openai.api_server import run_server
from vllm.entrypoints.openai.cli_args import make_arg_parser, validate_parsed_serve_args
from vllm.utils.argparse_utils import FlexibleArgumentParser


def main() -> None:
    parser = FlexibleArgumentParser(description="Serve a model for Thuruppu via vLLM")
    parser = make_arg_parser(parser)

    args = parser.parse_args(sys.argv[1:])
    validate_parsed_serve_args(args)

    print(f"Serving {args.model} on http://{args.host}:{args.port}", flush=True)
    # run_server(args)
    asyncio.run(run_server(args))


if __name__ == "__main__":
    main()
