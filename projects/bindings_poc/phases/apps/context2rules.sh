#!/bin/bash

# Generate load_rules.json from context.json by walking schema dependencies
# Usage: ./context2rules.sh [output_file]
#   If output_file is not specified, outputs to stdout

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${1:-}"

# Convert to absolute path if provided
if [ -n "$OUTPUT_FILE" ]; then
  case "$OUTPUT_FILE" in
    /*) ;; # Already absolute
    *) OUTPUT_FILE="$SCRIPT_DIR/$OUTPUT_FILE" ;;
  esac
fi

cd "$SCRIPT_DIR/context2rules/"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..." >&2
  npm install >&2
fi

if [ -n "$OUTPUT_FILE" ]; then
  npx ts-node context2rules.ts \
    --schemas "../../../schemas_v2" \
    --context "../../rules/context.json" \
    --output "$OUTPUT_FILE"
else
  npx ts-node context2rules.ts \
    --schemas "../../../schemas_v2" \
    --context "../../rules/context.json"
fi
