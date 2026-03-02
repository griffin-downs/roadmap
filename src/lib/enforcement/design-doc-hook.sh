#!/bin/bash

# Design Doc Enforcement Hook
# Pre-commit hook for enforcing design doc commitment during phases
# Blocks untracked .md files in .roadmap/ (except spec/)
# Ensures design decisions are documented and committed, not deferred to end
#
# Exit 0 if passes, 1 if blocked
# Can be bypassed with SKIP_DESIGN_CHECK environment variable

set -e

REPO_ROOT=$(git rev-parse --show-toplevel)
LOG_FILE="${REPO_ROOT}/.git/hooks.log"

# Check for bypass flag
if [ -n "$SKIP_DESIGN_CHECK" ]; then
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] SKIP_DESIGN_CHECK: $SKIP_DESIGN_CHECK" >> "$LOG_FILE"
  exit 0
fi

# Get all untracked files in the working tree
UNTRACKED_FILES=$(git ls-files --others --exclude-standard 2>/dev/null || true)

# Filter for .md files in .roadmap/ but exclude spec/ subdirectory
UNTRACKED_DESIGN_DOCS=$(echo "$UNTRACKED_FILES" | grep -E '^\.roadmap/.*\.md$' | grep -v '^\.roadmap/spec/' || true)

# If no untracked design docs found, pass the check
if [ -z "$UNTRACKED_DESIGN_DOCS" ]; then
  exit 0
fi

# Design docs found in untracked state - block the commit
echo "❌ Pre-commit hook: Design doc enforcement failed"
echo ""
echo "Untracked design documents found in .roadmap/:"
echo "$UNTRACKED_DESIGN_DOCS" | sed 's/^/  /'
echo ""
echo "Design docs must be committed during the phase they are written,"
echo "not deferred to the end. Please stage these files:"
echo "  git add .roadmap/<filename>"
echo ""
echo "Exception: .roadmap/spec/ files are version-controlled separately."
echo ""
echo "To bypass this check (not recommended):"
echo "  SKIP_DESIGN_CHECK='reason' git commit"
echo ""
exit 1
