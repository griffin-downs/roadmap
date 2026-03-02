#!/bin/bash

# Post-Session Worktree Cleanup Hook
# Invoked at session end to clean up stale/orphaned git worktrees
# Scans .claude/worktrees/ for:
#   - Stale worktrees (not modified in 7+ days)
#   - Orphaned worktrees (branch no longer exists in main repo)
#
# Exit 0 on success (or if nothing to clean), non-zero if critical failure
# Can be bypassed with SKIP_WORKTREE_CLEANUP environment variable

set -e

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "${PWD}")
LOG_FILE="${HOME}/.roadmap/cleanup.log"
TIMESTAMP=$(date +'%Y-%m-%d %H:%M:%S')

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Check for bypass flag
if [ -n "$SKIP_WORKTREE_CLEANUP" ]; then
  echo "[$TIMESTAMP] SKIP_WORKTREE_CLEANUP: $SKIP_WORKTREE_CLEANUP" >> "$LOG_FILE"
  exit 0
fi

# Determine Node.js command
NODE_CMD=$(command -v node || echo "npx node")

# Build cleanup script inline (TypeScript execution via ts-node)
# Import and invoke WorktreeCleanup class
cleanup_script=$(cat <<'EOF'
import { WorktreeCleanup } from './src/lib/enforcement/worktree-cleanup.js';

const cleanup = new WorktreeCleanup();
const results = cleanup.clean(false);

// Log results
const summary = cleanup.report(false);
console.log(JSON.stringify({
  timestamp: summary.timestamp,
  staleCount: summary.staleCount,
  orphanedCount: summary.orphanedCount,
  cleanedCount: summary.cleanedCount,
  failedCount: summary.failedCount,
  summary: summary.summary,
  results: results,
}, null, 2));

// Exit non-zero if any failures
process.exit(summary.failedCount > 0 ? 1 : 0);
EOF
)

# Execute cleanup via tsx (TypeScript execution)
cd "$REPO_ROOT" || exit 1

if command -v tsx &>/dev/null; then
  # Use tsx if available (installed in dev dependencies)
  output=$(tsx --eval "$cleanup_script" 2>&1 || true)
  exit_code=$?
elif [ -f "node_modules/.bin/tsx" ]; then
  # Fall back to local tsx
  output=$("./node_modules/.bin/tsx" --eval "$cleanup_script" 2>&1 || true)
  exit_code=$?
else
  # No TypeScript executor available - log warning and exit gracefully
  echo "[$TIMESTAMP] WARNING: tsx not found, skipping worktree cleanup" >> "$LOG_FILE"
  exit 0
fi

# Log results
{
  echo "[$TIMESTAMP] Post-session worktree cleanup completed"
  echo "$output"
} >> "$LOG_FILE"

# Only fail if there were critical failures (not just missing tsx)
if [ $exit_code -ne 0 ] && [ -n "$output" ] && echo "$output" | grep -q "error"; then
  echo "❌ Worktree cleanup errors detected (see $LOG_FILE for details)"
  exit 1
fi

exit 0
