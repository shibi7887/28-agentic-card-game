#!/usr/bin/env python3
"""Serve a model with SGLang for the Thuruppu game (OpenAI-compatible endpoint).

This is the logic layer. It is invoked by `scripts/serve-sglang.sh`, which
first sanitizes the environment (stripping anaconda's old libstdc++ from the
loader path). Do not run this file directly with anaconda's python3.

Usage (via the wrapper):
    ./scripts/serve-sglang.sh [model] [port]

Defaults: model=Qwen/Qwen3-8B, port=30000
"""

from __future__ import annotations

import argparse
import os

from sglang.srt.entrypoints.http_server import launch_server
from sglang.srt.server_args import ServerArgs


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve a model for Thuruppu via SGLang")
    parser.add_argument("model", nargs="?", default="Qwen/Qwen3-8B")
    parser.add_argument("port", nargs="?", type=int, default=30000)
    parser.add_argument(
        "--gpu-mem",
        type=float,
        default=float(os.environ.get("GPU_MEM", "0.85")),
        help="fraction of GPU memory to use (default 0.85)",
    )
    parser.add_argument(
        "--quantization",
        default=os.environ.get("QUANT", ""),
        help="quantization: awq, gptq, fp8, or empty for none",
    )
    parser.add_argument("--host", default="0.0.0.0")
    args = parser.parse_args()

    print(
        f"Serving {args.model} on http://{args.host}:{args.port} "
        f"(gpu_mem={args.gpu_mem}, quant={args.quantization or 'none'})",
        flush=True,
    )

    server_args = ServerArgs(
        model_path=args.model,
        host=args.host,
        port=args.port,
        mem_fraction_static=args.gpu_mem,
        quantization=args.quantization or None,
    )
    launch_server(server_args)


if __name__ == "__main__":
    main()
