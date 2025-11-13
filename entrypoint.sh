#!/bin/bash
set -e

echo "🚀 Phala Cloud X402 Entrypoint Script"
echo "======================================"

# Install dependencies if node_modules doesn't exist or package.json changed
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
else
  echo "✅ Dependencies already installed"
fi

# Check if running in development or production mode
MODE="${1:-prod}"

if [ "$MODE" = "dev" ]; then
  echo "🔧 Starting in DEVELOPMENT mode..."
  exec npm run dev
else
  echo "🏭 Starting in PRODUCTION mode..."
  echo "🔨 Building project..."
  npm run build
  echo "▶️  Starting server..."
  exec npm run start
fi
