#!/usr/bin/env npx ts-node

import * as fs from "fs";
import * as path from "path";

interface PrefixMap {
  [key: string]: string | null;
}

interface MakefileSection {
  [category: string]: string[];
}

interface MergedMakefile {
  $platform: string;
  $prefix_map: PrefixMap;
  srcs: MakefileSection;
  incs: MakefileSection;
}

interface SourcesDefinition {
  headers?: string[];
  sources?: string[];
  api?: { headers?: string[]; sources?: string[] };
  platform?: { headers?: string[]; sources?: string[] };
  sdk?: { headers?: string[]; sources?: string[] };
}

interface ConfigNode {
  $type?: string;
  $sources?: SourcesDefinition;
  $default?: unknown;
  $members?: Record<string, Record<string, ConfigNode>>;
  value?: unknown;
  [key: string]: unknown;
}

interface Configuration {
  configuration: Record<string, ConfigNode>;
  makefile: MergedMakefile;
}

interface CliArgs {
  configuration: string;
  output: string | null;
}

function parseArgs(args: string[]): CliArgs | null {
  const result: Partial<CliArgs> = { output: null };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if (arg === "--configuration" && nextArg) {
      result.configuration = nextArg;
      i++;
    } else if (arg === "--output" && nextArg) {
      result.output = nextArg;
      i++;
    } else if (arg === "--help" || arg === "-h") {
      return null;
    }
  }

  if (!result.configuration) {
    return null;
  }

  return result as CliArgs;
}

function printUsage() {
  console.log(
    "Usage: metadata2makefile.ts --configuration <file> [--output <file>]"
  );
  console.log("");
  console.log("Options:");
  console.log("  --configuration  Path to the configuration file");
  console.log("  --output         Output file (default: stdout)");
  console.log("  --help, -h       Show this help");
  console.log("");
  console.log("Example:");
  console.log("  npx ts-node metadata2makefile.ts \\");
  console.log("    --configuration ../rules/configuration.json \\");
  console.log("    --output src.mk");
}

function loadJson<T>(filePath: string): T {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as T;
}

// Check if a node has a value set (not null)
function hasValue(node: ConfigNode): boolean {
  return node.value !== undefined && node.value !== null;
}

// Determine category for a source path based on path structure
function categorizeSource(sourcePath: string): { category: string; file: string } | null {
  if (sourcePath.startsWith("include/")) {
    return { category: "no-os", file: sourcePath.replace("include/", "") };
  }
  if (sourcePath.startsWith("drivers/api/")) {
    return { category: "no-os-api", file: sourcePath.replace("drivers/api/", "") };
  }
  if (sourcePath.startsWith("drivers/accel/") || sourcePath.startsWith("drivers/adc-dac/")) {
    return { category: "driver", file: sourcePath.replace("drivers/", "") };
  }
  if (sourcePath.startsWith("drivers/platform/")) {
    return { category: "platform", file: path.basename(sourcePath) };
  }
  // Platform-relative paths (e.g., "maxim_spi.h")
  if (!sourcePath.includes("/")) {
    return { category: "platform", file: sourcePath };
  }
  // Paths with ../ (e.g., "../common/maxim_dma.c")
  if (sourcePath.startsWith("../") || sourcePath.includes("/")) {
    return { category: "platform", file: sourcePath };
  }
  return null;
}

// Collect sources from a $sources definition
function collectFromSourcesDef(
  sources: SourcesDefinition,
  collected: { srcs: MakefileSection; incs: MakefileSection }
) {
  // Direct headers/sources arrays
  for (const h of sources.headers || []) {
    const cat = categorizeSource(h);
    if (cat) {
      if (!collected.incs[cat.category]) collected.incs[cat.category] = [];
      if (!collected.incs[cat.category].includes(cat.file)) {
        collected.incs[cat.category].push(cat.file);
      }
    }
  }
  for (const s of sources.sources || []) {
    const cat = categorizeSource(s);
    if (cat) {
      if (!collected.srcs[cat.category]) collected.srcs[cat.category] = [];
      if (!collected.srcs[cat.category].includes(cat.file)) {
        collected.srcs[cat.category].push(cat.file);
      }
    }
  }

  // API sources (no_os_xxx.c/h)
  if (sources.api) {
    for (const h of sources.api.headers || []) {
      if (!collected.incs["no-os"]) collected.incs["no-os"] = [];
      if (!collected.incs["no-os"].includes(h)) {
        collected.incs["no-os"].push(h);
      }
    }
    for (const s of sources.api.sources || []) {
      if (!collected.srcs["no-os-api"]) collected.srcs["no-os-api"] = [];
      if (!collected.srcs["no-os-api"].includes(s)) {
        collected.srcs["no-os-api"].push(s);
      }
    }
  }

  // Platform driver sources
  if (sources.platform) {
    for (const h of sources.platform.headers || []) {
      if (!collected.incs["platform"]) collected.incs["platform"] = [];
      if (!collected.incs["platform"].includes(h)) {
        collected.incs["platform"].push(h);
      }
    }
    for (const s of sources.platform.sources || []) {
      if (!collected.srcs["platform"]) collected.srcs["platform"] = [];
      if (!collected.srcs["platform"].includes(s)) {
        collected.srcs["platform"].push(s);
      }
    }
  }

  // SDK sources
  if (sources.sdk) {
    for (const h of sources.sdk.headers || []) {
      if (!collected.incs["sdk"]) collected.incs["sdk"] = [];
      if (!collected.incs["sdk"].includes(h)) {
        collected.incs["sdk"].push(h);
      }
    }
    for (const s of sources.sdk.sources || []) {
      if (!collected.srcs["sdk"]) collected.srcs["sdk"] = [];
      if (!collected.srcs["sdk"].includes(s)) {
        collected.srcs["sdk"].push(s);
      }
    }
  }
}

// Check if any child of a node has an explicitly set value
function hasAnyConfiguredChild(node: ConfigNode): boolean {
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("$") || key === "value") continue;
    if (typeof value !== "object" || value === null) continue;

    const childNode = value as ConfigNode;

    // Check if this child has an explicitly set value
    if (childNode.value !== undefined && childNode.value !== null) {
      return true;
    }

    // Recursively check nested objects
    if (hasAnyConfiguredChild(childNode)) {
      return true;
    }
  }
  return false;
}

// Recursively walk the configuration tree and collect sources
// Only nodes with value set contribute their sources
function walkConfigurationTree(
  node: ConfigNode,
  collected: { srcs: MakefileSection; incs: MakefileSection },
  isTopLevel: boolean = false
) {
  // For top-level device nodes, always collect their sources (device is always needed)
  // For nested nodes, only collect if they have a value set
  if (isTopLevel && node.$sources) {
    collectFromSourcesDef(node.$sources, collected);
  }

  // Walk child properties
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("$") || key === "value") continue;
    if (typeof value !== "object" || value === null) continue;

    const childNode = value as ConfigNode;

    // Handle union types - walk only the selected member if selector has value
    if (childNode.$type === "union" && childNode.$members) {
      const selectorField = childNode.$selector as string;
      const selectorNode = node[selectorField] as ConfigNode | undefined;

      // Only walk union if selector has an explicit value set
      if (selectorNode && hasValue(selectorNode)) {
        const selectorValue = selectorNode.value as string;
        if (childNode.$members[selectorValue]) {
          const activeMember = childNode.$members[selectorValue];
          for (const propNode of Object.values(activeMember)) {
            walkConfigurationTree(propNode as ConfigNode, collected, false);
          }
        }
      }
      continue;
    }

    // Handle struct types - only walk if they have configured children
    if (childNode.$type === "struct" || childNode.$type === "platform_extra") {
      if (hasAnyConfiguredChild(childNode)) {
        if (childNode.$sources) {
          collectFromSourcesDef(childNode.$sources, collected);
        }
        walkConfigurationTree(childNode, collected, false);
      }
      continue;
    }

    // Handle platform_ops - only collect if value is set
    if (childNode.$type === "platform_ops" && childNode.$sources) {
      if (hasValue(childNode)) {
        collectFromSourcesDef(childNode.$sources, collected);
      }
      continue;
    }

    // Handle enum with $sources - only collect if value is set
    if (childNode.$type === "enum" && childNode.$sources) {
      if (hasValue(childNode)) {
        collectFromSourcesDef(childNode.$sources, collected);
      }
      continue;
    }

    // Handle arrays - walk items that have configured values
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          const itemNode = item as ConfigNode;
          if (hasAnyConfiguredChild(itemNode) || hasValue(itemNode)) {
            walkConfigurationTree(itemNode, collected, false);
          }
        }
      }
    }
  }
}

// Merge two makefile sections
function mergeSections(base: MakefileSection, additions: MakefileSection): MakefileSection {
  const result: MakefileSection = { ...base };
  for (const [category, files] of Object.entries(additions)) {
    if (!result[category]) {
      result[category] = [];
    }
    for (const file of files) {
      if (!result[category].includes(file)) {
        result[category].push(file);
      }
    }
  }
  return result;
}

function generateMakefileLines(
  section: MakefileSection,
  prefixMap: PrefixMap,
  varName: string
): string[] {
  const lines: string[] = [];

  for (const [category, files] of Object.entries(section)) {
    if (files.length === 0) continue;

    const prefix = prefixMap[category];
    if (prefix === undefined) {
      console.warn(`Warning: No prefix mapping for category "${category}"`);
      continue;
    }

    if (prefix === null) {
      continue;
    }

    const comment = `# ${category}`;
    lines.push(comment);

    if (files.length === 1) {
      lines.push(`${varName} += ${prefix}${files[0]}`);
    } else {
      const fileLines = files.map((f, i) => {
        const prefixedFile = `${prefix}${f}`;
        if (i === 0) {
          return `${varName} += ${prefixedFile} \\`;
        } else if (i === files.length - 1) {
          return `\t${prefixedFile}`;
        } else {
          return `\t${prefixedFile} \\`;
        }
      });
      lines.push(...fileLines);
    }
    lines.push("");
  }

  return lines;
}

function generateSrcMk(config: Configuration): string {
  const makefile = config.makefile;
  const prefixMap = makefile.$prefix_map;

  if (!prefixMap) {
    throw new Error("Configuration makefile missing $prefix_map");
  }

  // Collect sources from configuration tree
  const collected: { srcs: MakefileSection; incs: MakefileSection } = {
    srcs: {},
    incs: {},
  };

  for (const deviceConfig of Object.values(config.configuration)) {
    walkConfigurationTree(deviceConfig, collected, true);
  }

  // Merge with defaults
  const finalSrcs = mergeSections(makefile.srcs || {}, collected.srcs);
  const finalIncs = mergeSections(makefile.incs || {}, collected.incs);

  const lines: string[] = [];

  lines.push("# Auto-generated src.mk from configuration");
  lines.push(`# Platform: ${makefile.$platform}`);
  lines.push("# Do not edit manually");
  lines.push("");

  lines.push("# Sources");
  lines.push(...generateMakefileLines(finalSrcs, prefixMap, "SRCS"));

  lines.push("# Includes");
  lines.push(...generateMakefileLines(finalIncs, prefixMap, "INCS"));

  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args) {
    printUsage();
    process.exit(1);
  }

  const configPath = path.resolve(args.configuration);
  const outputPath = args.output ? path.resolve(args.output) : null;

  if (!fs.existsSync(configPath)) {
    console.error(`Error: Configuration file not found: ${configPath}`);
    process.exit(1);
  }

  const config = loadJson<Configuration>(configPath);

  if (!config.makefile) {
    console.error('Error: Configuration file missing "makefile" section');
    process.exit(1);
  }

  const srcMk = generateSrcMk(config);

  if (outputPath) {
    fs.writeFileSync(outputPath, srcMk);
    console.log(`Generated: ${outputPath}`);
  } else {
    console.log(srcMk);
  }
}

main();
