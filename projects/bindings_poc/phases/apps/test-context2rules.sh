#!/bin/bash

# Test context2rules by generating load_rules to a separate file
# and comparing against the current load_rules.json

GENERATED_FILE="./context2rules/load_rules_generated.json"

# Generate using context2rules.sh
./context2rules.sh "$GENERATED_FILE"

echo ""
echo "=== Comparing generated vs current load_rules.json ==="
echo ""

PASS=true

# Compare init paths (sorted)
GEN_INIT=$(jq -S '.["adi,adxl355"].init | sort' "$GENERATED_FILE")
CUR_INIT=$(jq -S '.["adi,adxl355"].init | sort' ../rules/load_rules.json)

if [ "$GEN_INIT" = "$CUR_INIT" ]; then
  echo "✓ Init paths match!"
else
  echo "✗ Init paths differ:"
  echo "Generated: $GEN_INIT"
  echo "Current:   $CUR_INIT"
  PASS=false
fi

# Compare uart extras (sorted)
GEN_UART=$(jq -S '.["adi,adxl355"].extras.uart | sort' "$GENERATED_FILE")
CUR_UART=$(jq -S '.["adi,adxl355"].extras.uart | sort' ../rules/load_rules.json)

if [ "$GEN_UART" = "$CUR_UART" ]; then
  echo "✓ Uart extras match!"
else
  echo "✗ Uart extras differ:"
  echo "Generated: $GEN_UART"
  echo "Current:   $CUR_UART"
  PASS=false
fi

echo ""
if [ "$PASS" = true ]; then
  echo "=== All tests passed! ==="
else
  echo "=== Some tests failed ==="
  exit 1
fi
