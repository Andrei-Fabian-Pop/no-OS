#!/bin/bash

# Full pipeline: context.json → src.mk for sdpk1-ad5592r-demo

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHASES_DIR="$SCRIPT_DIR/../phases/apps"
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Step 1: Generate load_rules from context
echo "Step 1: context2rules" >&2
cd "$PHASES_DIR/context2rules/"
npx ts-node context2rules.ts \
  --schemas "../../../schemas_v2" \
  --context "$SCRIPT_DIR/context.json" \
  --output "$TEMP_DIR/load_rules.json" >/dev/null

# Step 2: Generate configuration from load_rules
echo "Step 2: rules2configuration" >&2
cd "$PHASES_DIR/rules2configuration/"
npx ts-node rules2configuration.ts \
  --schemas "../../../schemas_v2" \
  --rules "$TEMP_DIR/load_rules.json" \
  --context "$SCRIPT_DIR/context.json" \
  --defaults "../../rules/default_makefile_metadata.json" \
  --level 2 \
  --output "$TEMP_DIR/configuration.json" >/dev/null

# Step 3: Generate src.mk from configuration
echo "Step 3: metadata2makefile" >&2
cd "$PHASES_DIR/metadata2makefile/"
npx ts-node metadata2makefile.ts \
  --configuration "$TEMP_DIR/configuration.json"

echo "Done!" >&2
