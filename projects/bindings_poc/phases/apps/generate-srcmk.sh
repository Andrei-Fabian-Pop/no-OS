#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

npx ts-node "$SCRIPT_DIR/metadata2makefile.ts" \
  --metadata "$SCRIPT_DIR/../rules/default_makefile_metadata.json" \
  --configuration "$SCRIPT_DIR/../rules/configuration1.json" \
  # --output "$SCRIPT_DIR/../../apard32690-adxl355-demo/src.mk"
