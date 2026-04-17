#!/usr/bin/env bash
# any-budget: ratcheting `any` count check for v2.10+
# Fails CI if `any` count exceeds the committed .any-budget.
# Budget can only go down. Every PR that reduces it commits a smaller number.

set -euo pipefail

BUDGET_FILE=".any-budget"
BUDGET=$(cat "$BUDGET_FILE" 2>/dev/null || echo 999999)

# Count :any, <any>, any[], as any across src/ and electron/
COUNT=$(grep -rE ":\s*any\b|<any>|any\[\]|as\s+any\b" \
  --include="*.ts" --include="*.tsx" \
  src electron 2>/dev/null | wc -l | tr -d ' ')

echo "any count: $COUNT (budget: $BUDGET)"

if [ "$COUNT" -gt "$BUDGET" ]; then
  echo ""
  echo "FAIL: \`any\` count ($COUNT) exceeds budget ($BUDGET)."
  echo "Either reduce \`any\` usage in your changes, or (if you're intentionally"
  echo "lowering the budget) update .any-budget to the new lower count."
  exit 1
fi

if [ "$COUNT" -lt "$BUDGET" ]; then
  echo "Tip: any count dropped below budget. Consider updating .any-budget to $COUNT to ratchet."
fi
