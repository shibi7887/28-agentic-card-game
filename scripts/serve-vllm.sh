#!/usr/bin/env bash
# Serve a model with vLLM for the Thuruppu game (OpenAI-compatible endpoint).
#
# Usage:
#   ./scripts/serve-vllm.sh [model] [port] [extra vLLM flags...]
#
# Defaults: model=Qwen/Qwen3-8B, port=30001
#
# vLLM and SGLang have INCOMPATIBLE torch pins, so vLLM lives in its own
# dedicated venv (.venv-vllm) — do not mix it with the SGLang .venv.
set -euo pipefail

# ── Sanitize the loader path (same rationale as serve-sglang.sh) ────────
if [ -n "${CONDA_PREFIX:-}" ]; then
  LD_LIBRARY_PATH="$(printf '%s' "${LD_LIBRARY_PATH:-}" | tr ':' '\n' | grep -v "^${CONDA_PREFIX}/" | paste -sd: -)"
  PATH="$(printf '%s' "${PATH}" | tr ':' '\n' | grep -v "^${CONDA_PREFIX}/" | paste -sd: -)"
  export LD_LIBRARY_PATH PATH
fi
unset CONDA_PREFIX CONDA_DEFAULT_ENV CONDA_PROMPT_MODIFIER CONDA_SHLVL 2>/dev/null || true

cd "$(dirname "$0")/.."

# ── GPU selection ────────────────────────────────────────────────────────
# Default to the 24 GiB RTX 3090 (Qwen3-8B needs ~16-17 GiB of weights,
# which does NOT fit on the 12 GiB RTX 3060). Override with:
#   THURUPPU_GPU=<index> ./scripts/serve-vllm.sh ...
# or set CUDA_VISIBLE_DEVICES yourself (it takes precedence).
if [ -z "${CUDA_VISIBLE_DEVICES:-}" ]; then
  export CUDA_VISIBLE_DEVICES="${THURUPPU_GPU:-0}"
fi

# Ensure the vLLM venv exists (clean uv-managed Python 3.12).
if [ ! -x .venv-vllm/bin/python ]; then
  echo "Creating vLLM venv (this may take a few minutes — installs torch+CUDA)..." >&2
  uv venv --python 3.12 .venv-vllm
  VIRTUAL_ENV=.venv-vllm uv pip install --python .venv-vllm/bin/python "vllm==0.27.1"
fi

# Translate positional [model] [port] into vLLM flags.
MODEL="${1:-Qwen/Qwen3-8B}"
PORT="${2:-30001}"
shift $(( $# >= 2 ? 2 : $# ))

# Qwen3-8B defaults to max_model_len=40960, which needs 5.62 GiB of KV cache
# and does not fit alongside the 15.27 GiB of weights at 0.8 GPU utilization.
# Cap it at 16384 (plenty for the game); users can override with their own
# --max-model-len flag.
if ! printf '%s ' "$@" | grep -q -- '--max-model-len'; then
  set -- "$@" --max-model-len 16384
fi

exec .venv-vllm/bin/python scripts/serve_vllm.py --model "${MODEL}" --port "${PORT}" "$@"
