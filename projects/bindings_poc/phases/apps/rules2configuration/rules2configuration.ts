#!/usr/bin/env npx ts-node

import * as fs from "fs";
import * as path from "path";
import * as YAML from "yaml";

// ============================================================================
// Types
// ============================================================================

interface LoadRules {
  [device: string]: {
    init: string[];
    extras?: { [name: string]: string[] };
  };
}

interface PropertyConstraint {
  minimum?: number;
  maximum?: number;
  allowed_values?: (string | number)[];
  pattern?: string;
}

interface ConditionalOverride {
  if?: {
    [property: string]: { value: unknown };
  };
  then?: {
    [property: string]: PropertyConstraint;
  };
}

interface SwitchOverride {
  $on: string;
  $cases: {
    [value: string]: {
      [property: string]: PropertyConstraint;
    };
  };
}

interface ParentOverrides {
  [property: string]: PropertyConstraint | ConditionalOverride | SwitchOverride;
}

interface OverrideDefinition {
  $parent?: ParentOverrides;
}

interface YamlSchema {
  $id: string;
  $type: "struct" | "enum" | "platform_ops_impl";
  $name: string;
  $description?: string;
  $sources?: { headers?: string[]; sources?: string[] };
  $override?: OverrideDefinition;
  symbol?: string;
  // For enums
  values?: { [key: string]: { description: string } } | string[];
  default?: string;
  // For platform_ops
  platforms?: {
    [platform: string]: {
      symbol: string;
      headers?: string[];
      sources?: string[];
    };
  };
  // For structs - all other keys are properties
  [key: string]: unknown;
}

interface ExpandedProperty {
  [key: string]: unknown;
}

interface MakefileSection {
  [category: string]: string[];
}

interface PlatformDefaults {
  srcs: MakefileSection;
  incs: MakefileSection;
}

interface MakefileDefaults {
  $description?: string;
  $prefix_map: { [key: string]: string | null };
  srcs: MakefileSection;
  incs: MakefileSection;
  platforms?: { [platform: string]: PlatformDefaults };
}

interface Context {
  platform: {
    target: string;
    vendor: string;
    prefix: string;
  };
  devices: { name: string }[];
  extra_init: string[];
}

interface CliArgs {
  schemas: string;
  rules: string;
  context: string;
  defaults: string;
  output: string | null;
  level: number;
}

// ============================================================================
// CLI Parsing
// ============================================================================

function parseArgs(args: string[]): CliArgs | null {
  const result: Partial<CliArgs> = { output: null, level: 1 };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if (arg === "--schemas" && nextArg) {
      result.schemas = nextArg;
      i++;
    } else if (arg === "--rules" && nextArg) {
      result.rules = nextArg;
      i++;
    } else if (arg === "--context" && nextArg) {
      result.context = nextArg;
      i++;
    } else if (arg === "--defaults" && nextArg) {
      result.defaults = nextArg;
      i++;
    } else if (arg === "--output" && nextArg) {
      result.output = nextArg;
      i++;
    } else if (arg === "--level" && nextArg) {
      const level = parseInt(nextArg, 10);
      if (level === 1 || level === 2) {
        result.level = level;
      } else {
        console.error("Error: --level must be 1 or 2");
        return null;
      }
      i++;
    } else if (arg === "--help" || arg === "-h") {
      return null;
    }
  }

  if (!result.schemas || !result.rules || !result.context || !result.defaults) {
    return null;
  }

  return result as CliArgs;
}

function printUsage() {
  console.log(
    "Usage: rules2configuration.ts --schemas <dir> --rules <file> --context <file> --defaults <file> [--output <file>] [--level <1|2>]"
  );
  console.log("");
  console.log("Options:");
  console.log("  --schemas   Path to schemas_v2 directory");
  console.log("  --rules     Path to load_rules.json");
  console.log("  --context   Path to context.json (contains platform info)");
  console.log("  --defaults  Path to default_makefile_metadata.json");
  console.log("  --output    Output file (default: stdout)");
  console.log("  --level     Override resolution level (default: 1)");
  console.log("              1 = Include $override as-is");
  console.log("              2 = Apply static overrides to parent properties");
  console.log("  --help      Show this help");
  console.log("");
  console.log("Example:");
  console.log("  npx ts-node rules2configuration.ts \\");
  console.log("    --schemas ../../schemas_v2 \\");
  console.log("    --rules ../rules/load_rules.json \\");
  console.log("    --context ../rules/context.json \\");
  console.log("    --defaults ../rules/default_makefile_metadata.json \\");
  console.log("    --level 2");
}

// ============================================================================
// File Loading
// ============================================================================

function loadJson<T>(filePath: string): T {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as T;
}

function mergeArraysUnique(a: string[] = [], b: string[] = []): string[] {
  return [...new Set([...a, ...b])];
}

function mergeMakefileSections(
  ...sections: MakefileSection[]
): MakefileSection {
  const result: MakefileSection = {};
  for (const section of sections) {
    for (const [category, files] of Object.entries(section)) {
      result[category] = mergeArraysUnique(result[category], files);
    }
  }
  return result;
}

function loadYaml(filePath: string): YamlSchema {
  const content = fs.readFileSync(filePath, "utf-8");
  return YAML.parse(content) as YamlSchema;
}

function normalizePath(p: string): string {
  // Add .yaml extension if missing
  if (!p.endsWith(".yaml")) {
    return p + ".yaml";
  }
  return p;
}

function resolveSchemaPath(schemasDir: string, schemaPath: string): string {
  return path.join(schemasDir, normalizePath(schemaPath));
}

// ============================================================================
// Validation
// ============================================================================

function validatePaths(
  schemasDir: string,
  loadRules: LoadRules
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const [device, rules] of Object.entries(loadRules)) {
    // Validate init paths
    for (const schemaPath of rules.init) {
      const fullPath = resolveSchemaPath(schemasDir, schemaPath);
      if (!fs.existsSync(fullPath)) {
        errors.push(`[${device}] init: File not found: ${fullPath}`);
      }
    }

    // Validate extras paths
    if (rules.extras) {
      for (const [extraName, extraPaths] of Object.entries(rules.extras)) {
        for (const schemaPath of extraPaths) {
          const fullPath = resolveSchemaPath(schemasDir, schemaPath);
          if (!fs.existsSync(fullPath)) {
            errors.push(
              `[${device}] extras.${extraName}: File not found: ${fullPath}`
            );
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Schema Expansion
// ============================================================================

class SchemaExpander {
  private schemasDir: string;
  private platform: string;
  private level: number;
  private loadedSchemas: Map<string, YamlSchema> = new Map();

  constructor(schemasDir: string, platform: string, level: number = 1) {
    this.schemasDir = schemasDir;
    this.platform = platform;
    this.level = level;
  }

  private loadSchema(schemaPath: string): YamlSchema {
    const fullPath = resolveSchemaPath(this.schemasDir, schemaPath);

    if (this.loadedSchemas.has(fullPath)) {
      return this.loadedSchemas.get(fullPath)!;
    }

    const schema = loadYaml(fullPath);
    this.loadedSchemas.set(fullPath, schema);
    return schema;
  }

  expandStruct(schemaPath: string): ExpandedProperty {
    const schema = this.loadSchema(schemaPath);
    return this.expandStructSchema(schema);
  }

  private expandStructSchema(schema: YamlSchema): ExpandedProperty {
    const result: ExpandedProperty = {};

    // Embed $sources in the output (for source collection based on configured values)
    if (schema.$sources) {
      result.$sources = schema.$sources;
    }

    // Embed $override rules in the output (for UI constraint enforcement)
    if (schema.$override) {
      result.$override = schema.$override;
    }

    // Get all property keys (exclude $ prefixed metadata)
    const propertyKeys = Object.keys(schema).filter(
      (k) => !k.startsWith("$") && k !== "values" && k !== "default" && k !== "platforms"
    );

    for (const key of propertyKeys) {
      const prop = schema[key] as Record<string, unknown>;
      result[key] = this.expandProperty(prop);
    }

    // Level 2: Apply static overrides from platform_extra to parent properties
    if (this.level >= 2) {
      this.applyOverridesToParent(result);
    }

    return result;
  }

  private applyOverridesToParent(result: ExpandedProperty): void {
    // Find platform_extra properties with $override
    for (const [, value] of Object.entries(result)) {
      if (typeof value !== "object" || value === null) continue;

      const prop = value as ExpandedProperty;
      if (prop.$type !== "platform_extra") continue;

      const override = prop.$override as OverrideDefinition | undefined;
      if (!override?.$parent) continue;

      // Apply static overrides (skip conditionals like $switch, $conditional)
      for (const [propName, constraints] of Object.entries(override.$parent)) {
        if (propName.startsWith("$")) continue; // Skip $switch, $conditional, etc.

        const targetProp = result[propName] as ExpandedProperty | undefined;
        if (!targetProp) continue;

        // Apply constraints to the target property
        const constraintObj = constraints as PropertyConstraint;
        if (constraintObj.minimum !== undefined) {
          targetProp.$minimum = this.parseNumericValue(constraintObj.minimum);
        }
        if (constraintObj.maximum !== undefined) {
          targetProp.$maximum = this.parseNumericValue(constraintObj.maximum);
        }
        if (constraintObj.allowed_values !== undefined) {
          targetProp.$allowed_values = constraintObj.allowed_values;
        }
        if (constraintObj.pattern !== undefined) {
          targetProp.$pattern = constraintObj.pattern;
        }
      }
    }
  }

  private parseNumericValue(value: unknown): number {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      // Handle YAML underscore notation like "1_000_000"
      return parseInt(value.replace(/_/g, ""), 10);
    }
    return 0;
  }

  private expandProperty(prop: Record<string, unknown>): ExpandedProperty {
    // If property has 'include', load and expand that schema
    if (prop.include) {
      const includePath = prop.include as string;
      const includedSchema = this.loadSchema(includePath);

      if (includedSchema.$type === "enum") {
        return this.expandEnum(includedSchema, prop.description as string | undefined);
      } else if (includedSchema.$type === "platform_ops_impl") {
        return this.expandPlatformOpsImpl(includedSchema, prop.description as string | undefined);
      } else if (includedSchema.$type === "struct") {
        const expanded = this.expandStructSchema(includedSchema);
        return {
          $type: "struct",
          $struct_type: includedSchema.$name,
          $description: (prop.description as string) || includedSchema.$description,
          ...expanded,
        };
      }
    }

    // Handle inline types
    const type = prop.type as string;

    if (type === "enum" && prop.values) {
      // Inline enum
      return {
        $type: "enum",
        $required: prop.required || undefined,
        $values: prop.values,
        $default: prop.default,
        $description: prop.description,
        value: null,
      };
    }

    if (type === "union") {
      return this.expandUnion(prop);
    }

    if (type === "platform_extra") {
      return this.expandPlatformExtra(prop);
    }

    if (type === "platform_ops") {
      return this.expandPlatformOps(prop);
    }

    if (type === "callback_func" || type === "callback_ctx") {
      return {
        $type: type,
        $signature: prop.signature,
        $default: prop.default,
        $description: prop.description,
        value: null,
      };
    }

    // Primitive type
    const result: ExpandedProperty = {
      $type: type,
      value: null,
    };
    if (prop.required) result.$required = prop.required;
    if (prop.default !== undefined) result.$default = prop.default;
    if (prop.description) result.$description = prop.description;

    return result;
  }

  private expandEnum(
    schema: YamlSchema,
    description?: string
  ): ExpandedProperty {
    let values: string[];
    if (Array.isArray(schema.values)) {
      values = schema.values;
    } else if (schema.values) {
      values = Object.keys(schema.values);
    } else {
      values = [];
    }

    const result: ExpandedProperty = {
      $type: "enum",
      $enum_type: schema.$name,
      $description: description || schema.$description,
      $values: values,
      $default: schema.default,
      value: null,
    };

    // Embed $sources if present
    if (schema.$sources) {
      result.$sources = schema.$sources;
    }

    return result;
  }

  private expandPlatformOps(prop: Record<string, unknown>): ExpandedProperty {
    const platforms = prop.platforms as Array<{ include: string }>;
    const target = prop.target as string;

    if (!platforms || platforms.length === 0) {
      return {
        $type: "platform_ops",
        $target: target,
        $description: prop.description,
        $note: "No platform implementations defined",
        $resolved: null,
        value: null,
      };
    }

    // Find the platform that matches our target platform
    const matchingPlatform = platforms.find((p) =>
      p.include.includes(`platforms/${this.platform}/`)
    );

    if (!matchingPlatform) {
      return {
        $type: "platform_ops",
        $target: target,
        $description: prop.description,
        $note: `No platform implementation for ${this.platform}`,
        $resolved: null,
        value: null,
      };
    }

    const platformInclude = matchingPlatform.include;
    const platformSchema = this.loadSchema(platformInclude);

    // API source is embedded in $sources for collection based on configured values
    const apiSource = target.replace("_platform_ops", "") + ".c";
    const apiHeader = target.replace("_platform_ops", "") + ".h";

    return this.expandPlatformOpsImpl(platformSchema, prop.description as string | undefined, target, apiSource, apiHeader);
  }

  private expandPlatformOpsImpl(
    schema: YamlSchema,
    description?: string,
    target?: string,
    apiSource?: string,
    apiHeader?: string
  ): ExpandedProperty {
    // Extract sources from the platform_ops_impl schema
    const sources = schema.$sources as {
      headers?: string[];
      sources?: string[];
      api?: { headers?: string[]; sources?: string[] };
      platform?: { headers?: string[]; sources?: string[] };
      sdk?: { headers?: string[]; sources?: string[] };
    } | undefined;

    // Build $sources object with all source information
    const embeddedSources: {
      headers: string[];
      sources: string[];
      api?: { headers: string[]; sources: string[] };
      platform?: { headers: string[]; sources: string[] };
      sdk?: { headers?: string[]; sources?: string[] };
    } = {
      headers: [],
      sources: [],
    };

    // Add default API sources (no_os_xxx.c/h) based on target name
    const apiHeaders: string[] = apiHeader ? [apiHeader] : [];
    const apiSources: string[] = apiSource ? [apiSource] : [];

    // Merge with explicit API sources from schema if present
    if (sources?.api) {
      apiHeaders.push(...(sources.api.headers || []));
      apiSources.push(...(sources.api.sources || []));
    }

    if (apiHeaders.length > 0 || apiSources.length > 0) {
      embeddedSources.api = {
        headers: apiHeaders,
        sources: apiSources,
      };
    }

    // Add platform driver sources
    if (sources) {
      const platformHeaders = [...(sources.headers || [])];
      const platformSources = [...(sources.sources || [])];

      // Merge with explicit platform sources from schema if present
      if (sources.platform) {
        platformHeaders.push(...(sources.platform.headers || []));
        platformSources.push(...(sources.platform.sources || []));
      }

      embeddedSources.platform = {
        headers: platformHeaders,
        sources: platformSources,
      };

      if (sources.sdk) {
        embeddedSources.sdk = sources.sdk;
      }
    }

    return {
      $type: "platform_ops",
      $target: target || schema.$name,
      $description: description || `Platform operations: ${schema.$name}`,
      $sources: embeddedSources,
      $resolved: {
        platform: this.platform,
        symbol: schema.symbol as string,
      },
      value: null,
    };
  }

  private expandUnion(prop: Record<string, unknown>): ExpandedProperty {
    const members = prop.members as Record<string, Record<string, unknown>>;
    const expandedMembers: Record<string, ExpandedProperty> = {};

    for (const [memberKey, memberValue] of Object.entries(members)) {
      expandedMembers[memberKey] = {};
      for (const [propKey, propValue] of Object.entries(memberValue)) {
        if (typeof propValue === "object" && propValue !== null) {
          const propWithInclude = propValue as Record<string, unknown>;
          if (propWithInclude.include) {
            const includedSchema = this.loadSchema(propWithInclude.include as string);
            const expanded = this.expandStructSchema(includedSchema);
            expandedMembers[memberKey][propKey] = {
              $type: "struct",
              $struct_type: includedSchema.$name,
              $description: (propWithInclude.description as string) || includedSchema.$description,
              ...expanded,
            };
          } else {
            expandedMembers[memberKey][propKey] = this.expandProperty(
              propValue as Record<string, unknown>
            );
          }
        }
      }
    }

    return {
      $type: "union",
      $selector: prop.selector,
      $description: prop.description,
      $required: prop.required,
      $members: expandedMembers,
    };
  }

  private expandPlatformExtra(prop: Record<string, unknown>): ExpandedProperty {
    const platforms = prop.platforms as Array<{ include: string }>;

    if (!platforms || platforms.length === 0) {
      return {
        $type: "platform_extra",
        $note: "No platform-specific init param",
        $resolved: null,
      };
    }

    // Find the platform that matches our target platform
    const matchingPlatform = platforms.find((p) =>
      p.include.includes(`platforms/${this.platform}/`)
    );

    if (!matchingPlatform) {
      return {
        $type: "platform_extra",
        $note: `No platform-specific init param for ${this.platform}`,
        $resolved: null,
      };
    }

    const platformInclude = matchingPlatform.include;
    const platformSchema = this.loadSchema(platformInclude);

    // expandStructSchema handles $sources collection
    const expanded = this.expandStructSchema(platformSchema);

    // Extract $override if present
    const override = this.extractOverride(platformSchema);

    const result: ExpandedProperty = {
      $type: "platform_extra",
      $struct_type: platformSchema.$name,
      $description: (prop.description as string) || platformSchema.$description,
      ...expanded,
    };

    if (override) {
      result.$override = override;
    }

    return result;
  }

  private extractOverride(schema: YamlSchema): OverrideDefinition | null {
    const override = schema.$override as Record<string, unknown> | undefined;
    if (!override) {
      return null;
    }

    const parent = override.$parent as Record<string, unknown> | undefined;
    if (!parent) {
      return null;
    }

    const result: OverrideDefinition = {
      $parent: {},
    };

    // Process each entry in $parent
    for (const [key, value] of Object.entries(parent)) {
      if (key === "if" || key === "then") {
        // Part of if/then conditional - handled separately
        continue;
      }

      if (key === "$switch") {
        // Switch/case conditional override
        const switchDef = value as { $on: string; $cases: Record<string, unknown> };
        result.$parent!["$switch"] = {
          $on: switchDef.$on,
          $cases: this.extractSwitchCases(switchDef.$cases),
        };
        continue;
      }

      // Regular property constraint
      if (typeof value === "object" && value !== null) {
        result.$parent![key] = value as PropertyConstraint;
      }
    }

    // Handle if/then block if present
    if (parent.if && parent.then) {
      const ifBlock = parent.if as Record<string, { value: unknown }>;
      const thenBlock = parent.then as Record<string, PropertyConstraint>;

      result.$parent!["$conditional"] = {
        if: ifBlock,
        then: thenBlock,
      } as unknown as PropertyConstraint;
    }

    return result;
  }

  private extractSwitchCases(
    cases: Record<string, unknown>
  ): Record<string, Record<string, PropertyConstraint>> {
    const result: Record<string, Record<string, PropertyConstraint>> = {};

    for (const [caseValue, caseOverrides] of Object.entries(cases)) {
      if (typeof caseOverrides === "object" && caseOverrides !== null) {
        result[caseValue] = caseOverrides as Record<string, PropertyConstraint>;
      }
    }

    return result;
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
  const rulesPath = path.resolve(args.rules);
  const contextPath = path.resolve(args.context);
  const defaultsPath = path.resolve(args.defaults);
  const outputPath = args.output ? path.resolve(args.output) : null;

  // Validate inputs exist
  if (!fs.existsSync(schemasDir)) {
    console.error(`Error: Schemas directory not found: ${schemasDir}`);
    process.exit(1);
  }

  if (!fs.existsSync(rulesPath)) {
    console.error(`Error: Rules file not found: ${rulesPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(contextPath)) {
    console.error(`Error: Context file not found: ${contextPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(defaultsPath)) {
    console.error(`Error: Defaults file not found: ${defaultsPath}`);
    process.exit(1);
  }

  // Load rules, context, and defaults
  const loadRules = loadJson<LoadRules>(rulesPath);
  const context = loadJson<Context>(contextPath);
  const defaults = loadJson<MakefileDefaults>(defaultsPath);
  const platform = context.platform.vendor;

  console.error(`Platform: ${platform}`);
  console.error(`Override level: ${args.level}`);

  // Validate all paths
  const validation = validatePaths(schemasDir, loadRules);
  if (!validation.valid) {
    console.error("Path validation failed:");
    for (const error of validation.errors) {
      console.error(`  ${error}`);
    }
    process.exit(1);
  }

  console.error("All paths validated successfully.");

  // Expand schemas
  const expander = new SchemaExpander(schemasDir, platform, args.level);
  const configuration: Record<string, ExpandedProperty> = {};

  for (const [device, rules] of Object.entries(loadRules)) {
    // The first entry in init should be the device schema
    const deviceSchemaPath = rules.init[0];
    console.error(`Expanding: ${device} from ${deviceSchemaPath}`);
    configuration[device] = expander.expandStruct(deviceSchemaPath);

    // Expand extras
    if (rules.extras) {
      for (const [extraName, extraPaths] of Object.entries(rules.extras)) {
        const extraSchemaPath = extraPaths[0];
        console.error(`Expanding extra: ${extraName} from ${extraSchemaPath}`);
        configuration[extraName] = expander.expandStruct(extraSchemaPath);
      }
    }
  }

  // Build makefile section with only defaults (sources are now embedded in configuration)
  const platformDefaults = defaults.platforms?.[platform];

  const mergedMakefile = {
    $platform: platform,
    $prefix_map: defaults.$prefix_map,
    srcs: mergeMakefileSections(
      defaults.srcs || {},
      platformDefaults?.srcs || {}
    ),
    incs: mergeMakefileSections(
      defaults.incs || {},
      platformDefaults?.incs || {}
    ),
  };

  const output = {
    configuration,
    makefile: mergedMakefile,
  };

  const outputJson = JSON.stringify(output, null, 2);

  if (outputPath) {
    fs.writeFileSync(outputPath, outputJson);
    console.error(`Generated: ${outputPath}`);
  } else {
    console.log(outputJson);
  }
}

main();
