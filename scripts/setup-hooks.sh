#!/bin/bash
# Setup script for installing commit hooks
# Run this after cloning or when updating hook scripts
# Usage: ./scripts/setup-hooks.sh

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "🔧 Setting up git hooks..."

# Configure git to use scripts/hooks directory
git config core.hooksPath scripts/hooks
echo "✓ git config core.hooksPath = scripts/hooks"

# Make all hook scripts executable
find scripts/hooks -type f ! -name "*.md" -exec chmod +x {} \;
echo "✓ Hook scripts are executable"

# Verify pre-commit hook exists and is runnable
if [ ! -x "scripts/hooks/pre-commit" ]; then
  echo "✗ ERROR: scripts/hooks/pre-commit not executable"
  exit 1
fi
echo "✓ Pre-commit hook is ready"

echo ""
echo "✅ Hooks configured successfully!"
echo "   Pre-commit hook will now run on: git commit"
echo "   To bypass (governance override): git commit --no-verify"
