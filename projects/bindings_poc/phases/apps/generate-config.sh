#!/bin/bash

LEVEL=2

cd ./rules2configuration/
npx ts-node "rules2configuration.ts" \
  --schemas "../../../schemas_v2" \
  --rules "../../rules/load_rules.json" \
  --context "../../rules/context.json" \
  --defaults "../../rules/default_makefile_metadata.json" \
  --level "$LEVEL" \
  --output "configuration_generated_lvl_$LEVEL.json"
cd ../
