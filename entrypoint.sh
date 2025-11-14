#!/bin/bash
set -e

echo "🚀 Phala Cloud X402 Entrypoint Script"
echo "======================================"

# Check if pnpm is installed, install if not
if ! command -v pnpm &> /dev/null; then
  echo "📦 pnpm not found, installing pnpm..."
  npm install -g pnpm
  echo "✅ pnpm installed successfully"
else
  echo "✅ pnpm is already installed"
fi

# Install dependencies if node_modules doesn't exist or package.json changed
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
  echo "📦 Installing dependencies..."
  pnpm install
else
  echo "✅ Dependencies already installed"
fi

# Check if running in development or production mode
MODE="${1:-prod}"

if [ "$MODE" = "dev" ]; then
  echo "🔧 Starting in DEVELOPMENT mode..."
  exec pnpm run dev
else
  echo "🏭 Starting in PRODUCTION mode..."
  echo "🔨 Building project..."
  pnpm run build
  echo "▶️  Starting server..."
  exec pnpm run start
fi
