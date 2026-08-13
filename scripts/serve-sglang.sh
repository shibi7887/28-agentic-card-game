#!/usr/bin/env bash
# Serve a model with SGLang for the Thuruppu game (OpenAI-compatible endpoint).
#
# Usage:
#   ./scripts/serve-sglang.sh [model] [port]
#
# Defaults: model=Qwen/Qwen3-8B, port=30000
#
# The server exposes http://localhost:PORT/v1/chat/completions —
# point AGENT_*_PROVIDER at it (see .env.example).
#
# GPU memory notes:
#   - bf16 (no quantization): ~2 bytes/param. 8B ≈ 16 GB (fits 24 GB), 14B ≈ 28 GB (does NOT fit).
#   - FP8-on-the-fly still spikes to full bf16 during load, so it does NOT help 14B fit.
#   - To run 14B on a 24 GB card, use a PRE-QUANTIZED checkpoint (AWQ/GPTQ, ~4-bit ≈ 8 GB).
#
# Examples:
#   ./scripts/serve-sglang.sh Qwen/Qwen3-8B 30000                    # fits, bf16
#   ./scripts/serve-sglang.sh Qwen/Qwen3-14B-AWQ 30000               # 4-bit, fits
set -euo pipefail

# ── Sanitize the loader path ──────────────────────────────────────────
# Conda/anaconda ships an old libstdc++ (GLIBCXX_3.4.29) that breaks
# flashinfer's JIT-compiled CUDA kernels (which need GLIBCXX_3.4.32+).
# Neutralize conda's library influence so the SYSTEM libstdc++ wins.
if [ -n "${CONDA_PREFIX:-}" ]; then
  # Drop conda's lib/bin from LD_LIBRARY_PATH and PATH.
  LD_LIBRARY_PATH="$(printf '%s' "${LD_LIBRARY_PATH:-}" | tr ':' '\n' | grep -v "^${CONDA_PREFIX}/" | paste -sd: -)"
  PATH="$(printf '%s' "${PATH}" | tr ':' '\n' | grep -v "^${CONDA_PREFIX}/" | paste -sd: -)"
  export LD_LIBRARY_PATH PATH
fi
unset CONDA_PREFIX CONDA_DEFAULT_ENV CONDA_PROMPT_MODIFIER CONDA_SHLVL 2>/dev/null || true

MODEL="${1:-Qwen/Qwen3-8B}"
PORT="${2:-30000}"
GPU_MEM="${GPU_MEM:-0.85}"      # fraction of GPU memory to use

cd "$(dirname "$0")/.."

# Ensure the venv exists using a clean uv-managed Python 3.12 (has Python.h
# for Triton JIT, and no anaconda RPATH that would break flashinfer/libstdc++).
PYBIN="$(uv python find 3.12 2>/dev/null || true)"
if [ -z "${PYBIN}" ]; then
  echo "Installing Python 3.12 via uv..." >&2
  uv python install 3.12
  PYBIN="$(uv python find 3.12)"
fi
if [ ! -x .venv/bin/python ]; then
  echo "Creating venv with Python 3.12 (this may take a few minutes)..." >&2
  uv venv --python 3.12
  uv sync --python 3.12
fi

echo "Serving ${MODEL} on http://0.0.0.0:${PORT} (gpu_mem=${GPU_MEM})" >&2

# Note: no --quantization flag. For quantized models use the AWQ/GPTQ repo
# directly (e.g. Qwen/Qwen3-14B-AWQ); SGLang detects the checkpoint format.
exec .venv/bin/python -m sglang.launch_server \
  --model "${MODEL}" \
  --host 0.0.0.0 \
  --port "${PORT}" \
  --mem-fraction-static "${GPU_MEM}"
