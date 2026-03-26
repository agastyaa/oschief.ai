#!/bin/bash
# download-bundled-models.sh — Download and stage AI models for bundling into the app.
# Run before electron-builder to include models in extraResources.
# Gated by BUNDLE_MODELS=true to keep dev builds small.
#
# Usage:
#   BUNDLE_MODELS=true ./scripts/download-bundled-models.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DARWIN_DIR="$PROJECT_ROOT/electron/resources/darwin"
MODELS_DIR="$DARWIN_DIR/models"

if [ "${BUNDLE_MODELS:-}" != "true" ]; then
  echo "[bundled-models] BUNDLE_MODELS not set — skipping model downloads (dev build)"
  exit 0
fi

echo "=== Building Swift binaries ==="

# Build Parakeet CoreML binary
echo "[1/4] Building syag-parakeet-coreml..."
cd "$DARWIN_DIR/parakeet-coreml"
swift build -c release
PARAKEET_BIN="$DARWIN_DIR/parakeet-coreml/.build/release/syag-parakeet-coreml"
echo "  Built: $PARAKEET_BIN"

# Build MLX LLM binary
echo "[2/4] Building syag-mlx-llm..."
cd "$DARWIN_DIR/syag-mlx-llm"
swift build -c release
MLX_BIN="$DARWIN_DIR/syag-mlx-llm/.build/release/syag-mlx-llm"
echo "  Built: $MLX_BIN"

echo ""
echo "=== Downloading model weights ==="

# Download Parakeet CoreML models
echo "[3/4] Downloading Parakeet CoreML models (~600MB)..."
mkdir -p "$MODELS_DIR/parakeet-coreml"
"$PARAKEET_BIN" download
# Copy FluidAudio cache to bundled location
FLUID_CACHE="$HOME/Library/Caches/FluidAudio"
if [ -d "$FLUID_CACHE" ]; then
  cp -R "$FLUID_CACHE"/* "$MODELS_DIR/parakeet-coreml/" 2>/dev/null || true
fi
echo "ok" > "$MODELS_DIR/parakeet-coreml/.models-ready"
echo "  Parakeet models staged at: $MODELS_DIR/parakeet-coreml/"

# Download MLX Qwen3-4B models
echo "[4/4] Downloading Qwen3-4B MLX weights (~2.5GB)..."
mkdir -p "$MODELS_DIR/mlx-qwen3-4b"
"$MLX_BIN" download
echo "  MLX models ready"

echo ""
echo "=== Staging binaries for packaging ==="

# Copy built binaries to top-level darwin/ for extraResources
cp "$PARAKEET_BIN" "$DARWIN_DIR/syag-parakeet-coreml"
cp "$MLX_BIN" "$DARWIN_DIR/syag-mlx-llm"
echo "  Binaries copied to: $DARWIN_DIR/"

echo ""
echo "=== Done ==="
echo "Total bundled model size:"
du -sh "$MODELS_DIR" 2>/dev/null || echo "(could not calculate)"
echo ""
echo "Run 'npm run build:electron' to package the app with bundled models."
