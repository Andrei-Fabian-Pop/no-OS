#!/bin/bash

cd ./metadata2makefile/
npx ts-node "metadata2makefile.ts" \
  --configuration "../rules2configuration/configuration_generated_lvl_2.json"
  # --output "../../../apard32690-adxl355-demo/src.mk"
cd ../
