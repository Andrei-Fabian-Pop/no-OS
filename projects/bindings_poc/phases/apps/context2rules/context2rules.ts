#!/usr/bin/env npx ts-node

import * as fs from "fs";
import * as path from "path";
import * as YAML from "yaml";

// ============================================================================
// Types
// ============================================================================

interface Context {
  platform: {
    target: string;
    vendor: string;
    prefix: string;
  };
  devices: { name: string }[];
  extra_init: string[];
}

interface YamlSchema {
  $id: string;
  $type: string;
  $name: string;
  [key: string]: unknown;
}

interface LoadRules {
  [device: string]: {
    init: string[];
    extras?: { [name: string]: string[] };
  };
}

interface CliArgs {
  schemas: string;
  context: string;
  output: string | null;
}

// ============================================================================
// CLI Parsing
// ============================================================================

function parseArgs(args: string[]): CliArgs | null {
  const result: Partial<CliArgs> = { output: null };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if (arg === "--schemas" && nextArg) {
      result.schemas = nextArg;
      i++;
    } else if (arg === "--context" && nextArg) {
      result.context = nextArg;
      i++;
    } else if (arg === "--output" && nextArg) {
      result.output = nextArg;
      i++;
    } else if (arg === "--help" || arg === "-h") {
      return null;
    }
  }

  if (!result.schemas || !result.context) {
    return null;
  }

  return result as CliArgs;
}

function printUsage() {
  console.log(
    "Usage: context2rules.ts --schemas <dir> --context <file> [--output <file>]"
  );
  console.log("");
  console.log("Options:");
  console.log("  --schemas  Path to schemas_v2 directory");
  console.log("  --context  Path to context.json");
  console.log("  --output   Output file (default: stdout)");
  console.log("  --help     Show this help");
  console.log("");
  console.log("Example:");
  console.log("  npx ts-node context2rules.ts \\");
  console.log("    --schemas ../../schemas_v2 \\");
  console.log("    --context ../rules/context.json \\");
  console.log("    --output ../rules/load_rules.json");
}

// ============================================================================
// File Loading
// ============================================================================

function loadJson<T>(filePath: string): T {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as T;
}

function loadYaml(filePath: string): YamlSchema {
  const content = fs.readFileSync(filePath, "utf-8");
  return YAML.parse(content) as YamlSchema;
}

function normalizePath(p: string): string {
  // Add .yaml for file system operations
  if (!p.endsWith(".yaml")) {
    return p + ".yaml";
  }
  return p;
}

function stripYamlExtension(p: string): string {
  // Remove .yaml for output (load_rules should not have extensions)
  if (p.endsWith(".yaml")) {
    return p.slice(0, -5);
  }
  return p;
}

function resolveSchemaPath(schemasDir: string, schemaPath: string): string {
  return path.join(schemasDir, normalizePath(schemaPath));
}

// ============================================================================
// Schema Walker
// ============================================================================

class SchemaWalker {
  private schemasDir: string;
  private platformVendor: string;
  private platformTarget: string;
  private visitedPaths: Set<string> = new Set();
  private collectedPaths: string[] = [];

  constructor(schemasDir: string, platformVendor: string, platformTarget: string) {
    this.schemasDir = schemasDir;
    this.platformVendor = platformVendor;
    this.platformTarget = platformTarget;
  }

  walkFromEntryPoint(schemaPath: string): string[] {
    this.visitedPaths.clear();
    this.collectedPaths = [];
    this.walkSchema(schemaPath);
    // Strip .yaml extension from all paths for output
    return this.collectedPaths.map(stripYamlExtension);
  }

  private walkSchema(schemaPath: string): void {
    const normalizedPath = normalizePath(schemaPath);

    if (this.visitedPaths.has(normalizedPath)) {
      return;
    }
    this.visitedPaths.add(normalizedPath);

    const fullPath = resolveSchemaPath(this.schemasDir, schemaPath);

    if (!fs.existsSync(fullPath)) {
      console.error(`Warning: Schema not found: ${fullPath}`);
      return;
    }

    this.collectedPaths.push(normalizedPath);

    const schema = loadYaml(fullPath);
    this.walkSchemaProperties(schema);
  }

  private walkSchemaProperties(schema: YamlSchema): void {
    for (const [key, value] of Object.entries(schema)) {
      if (key.startsWith("$")) continue;
      if (key === "values" || key === "default" || key === "platforms") continue;

      if (typeof value === "object" && value !== null) {
        this.walkProperty(value as Record<string, unknown>);
      }
    }
  }

  private walkProperty(prop: Record<string, unknown>): void {
    // Handle regular include
    if (prop.include && typeof prop.include === "string") {
      this.walkSchema(prop.include);
      return;
    }

    // Handle platform_extra or platform_ops with platforms array
    if ((prop.type === "platform_extra" || prop.type === "platform_ops") && prop.platforms) {
      const platforms = prop.platforms as Array<{ include: string }>;
      const matchingPlatform = this.findMatchingPlatform(platforms);

      if (matchingPlatform) {
        this.walkSchema(matchingPlatform.include);
      }
      return;
    }

    // Handle union members
    if (prop.type === "union" && prop.members) {
      const members = prop.members as Record<string, Record<string, unknown>>;
      for (const memberValue of Object.values(members)) {
        for (const propValue of Object.values(memberValue)) {
          if (typeof propValue === "object" && propValue !== null) {
            this.walkProperty(propValue as Record<string, unknown>);
          }
        }
      }
      return;
    }
  }

  private findMatchingPlatform(platforms: Array<{ include: string }>): { include: string } | undefined {
    // First try to find exact match with vendor/target
    const exactMatch = platforms.find((p) =>
      p.include.includes(`platforms/${this.platformVendor}/${this.platformTarget}/`)
    );
    if (exactMatch) {
      return exactMatch;
    }

    // Fall back to vendor-only match
    const vendorMatch = platforms.find((p) =>
      p.include.includes(`platforms/${this.platformVendor}/`)
    );
    return vendorMatch;
  }
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args) {
    printUsage();
    process.exit(1);
  }

  const schemasDir = path.resolve(args.schemas);
  const contextPath = path.resolve(args.context);
  const outputPath = args.output ? path.resolve(args.output) : null;

  // Validate inputs exist
  if (!fs.existsSync(schemasDir)) {
    console.error(`Error: Schemas directory not found: ${schemasDir}`);
    process.exit(1);
  }

  if (!fs.existsSync(contextPath)) {
    console.error(`Error: Context file not found: ${contextPath}`);
    process.exit(1);
  }

  // Load context
  const context = loadJson<Context>(contextPath);
  const { vendor, target } = context.platform;

  console.error(`Platform: ${vendor}/${target}`);
  console.error(`Devices: ${context.devices.map(d => d.name).join(", ")}`);
  console.error(`Extra init: ${context.extra_init.join(", ")}`);

  const walker = new SchemaWalker(schemasDir, vendor, target);
  const loadRules: LoadRules = {};

  // Process each device
  for (const device of context.devices) {
    const deviceName = device.name;
    const deviceSchemaPath = `devices/${deviceName}`;

    console.error(`\nWalking: ${deviceName}`);
    const initPaths = walker.walkFromEntryPoint(deviceSchemaPath);
    console.error(`  Found ${initPaths.length} schemas`);

    loadRules[deviceName] = {
      init: initPaths,
    };

    // Process extras for this device
    if (context.extra_init.length > 0) {
      loadRules[deviceName].extras = {};

      for (const extra of context.extra_init) {
        const extraSchemaPath = `no-os/no_os_${extra}_init_param`;
        console.error(`Walking extra: ${extra}`);
        const extraPaths = walker.walkFromEntryPoint(extraSchemaPath);
        console.error(`  Found ${extraPaths.length} schemas`);

        loadRules[deviceName].extras![extra] = extraPaths;
      }
    }
  }

  const outputJson = JSON.stringify(loadRules, null, 2);

  if (outputPath) {
    fs.writeFileSync(outputPath, outputJson);
    console.error(`\nGenerated: ${outputPath}`);
  } else {
    console.log(outputJson);
  }
}

main();
