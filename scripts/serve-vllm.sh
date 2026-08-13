#!/usr/bin/env bash
# Serve a model with vLLM for the Thuruppu game (OpenAI-compatible endpoint).
#
# Usage:
#   ./scripts/serve-vllm.sh [model] [port] [extra vLLM flags...]
#
# Defaults: model=Qwen/Qwen3-8B, port=8000
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

# Ensure the vLLM venv exists (clean uv-managed Python 3.12).
if [ ! -x .venv-vllm/bin/python ]; then
  echo "Creating vLLM venv (this may take a few minutes — installs torch+CUDA)..." >&2
  uv venv --python 3.12 .venv-vllm
  VIRTUAL_ENV=.venv-vllm uv pip install --python .venv-vllm/bin/python "vllm==0.27.1"
fi

# Translate positional [model] [port] into vLLM flags.
MODEL="${1:-Qwen/Qwen3-8B}"
PORT="${2:-8000}"
shift $(( $# >= 2 ? 2 : $# ))

exec .venv-vllm/bin/python scripts/serve_vllm.py --model "${MODEL}" --port "${PORT}" "$@"
