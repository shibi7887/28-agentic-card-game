#!/usr/bin/env bash
# Serve a model with SGLang for the Thuruppu game (OpenAI-compatible endpoint).
#
# Usage:
#   ./scripts/serve-sglang.sh [model] [port] [--gpu-mem 0.85] [--quantization awq]
#
# Defaults: model=Qwen/Qwen3-8B, port=30000
#
# The server exposes http://localhost:PORT/v1/chat/completions —
# point AGENT_*_PROVIDER at it (see .env.example).
#
# GPU memory notes:
#   - bf16 (no quantization): ~2 bytes/param. 8B ≈ 16 GB (fits 24 GB), 14B ≈ 28 GB (does NOT fit).
#   - To run 14B on a 24 GB card, use a PRE-QUANTIZED checkpoint (AWQ/GPTQ).
set -euo pipefail

# ── Sanitize the loader path ──────────────────────────────────────────
# Conda/anaconda ships an old libstdc++ (GLIBCXX_3.4.29) that breaks
# flashinfer's JIT-compiled CUDA kernels (which need GLIBCXX_3.4.32+).
# Neutralize conda's library influence so the SYSTEM libstdc++ wins.
# This MUST happen before any Python process starts.
if [ -n "${CONDA_PREFIX:-}" ]; then
  LD_LIBRARY_PATH="$(printf '%s' "${LD_LIBRARY_PATH:-}" | tr ':' '\n' | grep -v "^${CONDA_PREFIX}/" | paste -sd: -)"
  PATH="$(printf '%s' "${PATH}" | tr ':' '\n' | grep -v "^${CONDA_PREFIX}/" | paste -sd: -)"
  export LD_LIBRARY_PATH PATH
fi
unset CONDA_PREFIX CONDA_DEFAULT_ENV CONDA_PROMPT_MODIFIER CONDA_SHLVL 2>/dev/null || true

cd "$(dirname "$0")/.."

# Ensure the venv exists using a clean uv-managed Python 3.12 (has Python.h
# for Triton JIT, and no anaconda RPATH that would break flashinfer/libstdc++).
if [ ! -x .venv/bin/python ]; then
  echo "Creating venv with Python 3.12 (this may take a few minutes)..." >&2
  uv python install 3.12
  uv venv --python 3.12
  uv sync --python 3.12
fi

# Delegate all logic to the Python launcher.
exec .venv/bin/python scripts/serve_sglang.py "$@"
