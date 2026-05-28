#!/usr/bin/env npx ts-node

import * as fs from "fs";
import * as path from "path";
import { CliArgs } from "./types";
import { parseHeader, findStruct, findUnion, findEnum } from "./parser";
import { buildSchemaIndex } from "./resolver";
import { generateStructSchema, generateUnionSchema, generateEnumSchema, GenerateContext } from "./generator";

function parseArgs(args: string[]): CliArgs | null {
  const result: Partial<CliArgs> = {
    struct: null,
    union: null,
    enum: null,
    schemaDir: null,
    output: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if ((arg === "--file" || arg === "-f") && nextArg) {
      result.file = nextArg;
      i++;
    } else if (arg === "--struct" && nextArg) {
      result.struct = nextArg;
      i++;
    } else if (arg === "--union" && nextArg) {
      result.union = nextArg;
      i++;
    } else if (arg === "--enum" && nextArg) {
      result.enum = nextArg;
      i++;
    } else if (arg === "--schemas" && nextArg) {
      result.schemas = nextArg;
      i++;
    } else if (arg === "--schema-dir" && nextArg) {
      result.schemaDir = nextArg;
      i++;
    } else if ((arg === "--output" || arg === "-o") && nextArg) {
      result.output = nextArg;
      i++;
    } else if (arg === "--noos-root" && nextArg) {
      result.noosRoot = nextArg;
      i++;
    } else if (arg === "--help" || arg === "-h") {
      return null;
    }
  }

  if (!result.file || !result.schemas) {
    return null;
  }

  if (!result.struct && !result.union && !result.enum) {
    return null;
  }

  if (!result.noosRoot) {
    result.noosRoot = process.cwd();
  }

  return result as CliArgs;
}

function printUsage(): void {
  console.log("Usage: struct2yaml.ts --file <header.h> --struct <name> --schemas <dir>");
  console.log("       struct2yaml.ts --file <header.h> --union <name> --schemas <dir>");
  console.log("       struct2yaml.ts --file <header.h> --enum <name> --schemas <dir>");
  console.log("");
  console.log("Generate YAML schema from C struct/union/enum definitions.");
  console.log("");
  console.log("Required arguments:");
  console.log("  --file, -f      Path to C header file");
  console.log("  --struct        Name of struct to generate schema for");
  console.log("  --union         Name of union to generate schema for");
  console.log("  --enum          Name of enum to generate schema for");
  console.log("  --schemas       Path to schemas_v2 directory for include resolution");
  console.log("");
  console.log("Optional arguments:");
  console.log("  --schema-dir    Override auto-generated $id directory");
  console.log("  --output, -o    Output file (default: stdout)");
  console.log("  --noos-root     Path to no-OS root (default: current directory)");
  console.log("  --help, -h      Show this help");
  console.log("");
  console.log("Examples:");
  console.log("  npx ts-node struct2yaml.ts \\");
  console.log("    --file drivers/adc-dac/ad5592r/ad5592r-base.h \\");
  console.log("    --struct ad5592r_init_param \\");
  console.log("    --schemas ../../schemas_v2");
  console.log("");
  console.log("  npx ts-node struct2yaml.ts \\");
  console.log("    --file drivers/accel/adxl313/adxl313.h \\");
  console.log("    --union adxl313_comm_init_param \\");
  console.log("    --schemas ../../schemas_v2");
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (!args) {
    printUsage();
    process.exit(1);
  }

  const noosRoot = path.resolve(args.noosRoot);
  const headerFullPath = path.isAbsolute(args.file)
    ? args.file
    : path.resolve(args.noosRoot, args.file);
  if (!fs.existsSync(headerFullPath)) {
    console.error(`Error: Header file not found: ${headerFullPath}`);
    process.exit(1);
  }

  const headerRelativePath = path.relative(noosRoot, headerFullPath);

  const schemasFullPath = path.resolve(args.schemas);
  if (!fs.existsSync(schemasFullPath)) {
    console.error(`Error: Schemas directory not found: ${schemasFullPath}`);
    process.exit(1);
  }

  const headerContent = fs.readFileSync(headerFullPath, "utf-8");
  const parsed = parseHeader(headerContent);

  console.error(`Parsed ${parsed.structs.length} structs, ${parsed.unions.length} unions, and ${parsed.enums.length} enums from ${headerRelativePath}`);

  const schemaIndex = buildSchemaIndex(schemasFullPath);
  console.error(`Built schema index with ${Object.keys(schemaIndex).length} entries`);

  const generateContext: GenerateContext = {
    headerPath: headerRelativePath,
    schemasPath: args.schemas,
    noosRoot: args.noosRoot,
  };

  let result: { yaml: string; warnings: string[] };

  if (args.struct) {
    const struct = findStruct(parsed, args.struct);
    if (!struct) {
      console.error(`Error: Struct '${args.struct}' not found in ${headerRelativePath}`);
      console.error(`Available structs: ${parsed.structs.map((s) => s.name).join(", ") || "none"}`);
      process.exit(1);
    }

    result = generateStructSchema(struct, generateContext, schemaIndex, args.schemaDir);
  } else if (args.union) {
    const union = findUnion(parsed, args.union);
    if (!union) {
      console.error(`Error: Union '${args.union}' not found in ${headerRelativePath}`);
      console.error(`Available unions: ${parsed.unions.map((u) => u.name).join(", ") || "none"}`);
      process.exit(1);
    }

    result = generateUnionSchema(union, generateContext, schemaIndex, args.schemaDir);
  } else if (args.enum) {
    const enumDef = findEnum(parsed, args.enum);
    if (!enumDef) {
      console.error(`Error: Enum '${args.enum}' not found in ${headerRelativePath}`);
      console.error(`Available enums: ${parsed.enums.map((e) => e.name).join(", ") || "none"}`);
      process.exit(1);
    }

    result = generateEnumSchema(enumDef, headerRelativePath, args.schemaDir);
  } else {
    console.error("Error: Must specify --struct, --union, or --enum");
    process.exit(1);
  }

  for (const warning of result.warnings) {
    console.error(warning);
  }

  if (args.output) {
    const outputDir = path.dirname(args.output);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(args.output, result.yaml);
    console.error(`Written to ${args.output}`);
  } else {
    console.log(result.yaml);
  }
}

main();
