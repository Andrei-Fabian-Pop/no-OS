#!/usr/bin/env npx ts-node

import * as fs from "fs";
import * as path from "path";

interface PrefixMap {
  [key: string]: string | null;
}

interface MakefileSection {
  [category: string]: string[];
}

interface MakefileMetadata {
  $description?: string;
  $note?: string;
  $prefix_map: PrefixMap;
  $notes?: { [key: string]: string };
  srcs: MakefileSection;
  incs: MakefileSection;
}

interface Configuration {
  configuration: unknown;
  makefile: MakefileMetadata;
}

interface CliArgs {
  metadata: string;
  configuration: string;
  output: string | null;
}

function parseArgs(args: string[]): CliArgs | null {
  const result: Partial<CliArgs> = { output: null };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if (arg === "--metadata" && nextArg) {
      result.metadata = nextArg;
      i++;
    } else if (arg === "--configuration" && nextArg) {
      result.configuration = nextArg;
      i++;
    } else if (arg === "--output" && nextArg) {
      result.output = nextArg;
      i++;
    } else if (arg === "--help" || arg === "-h") {
      return null;
    }
  }

  if (!result.metadata || !result.configuration) {
    return null;
  }

  return result as CliArgs;
}

function printUsage() {
  console.log("Usage: metadata2makefile.ts --metadata <file> --configuration <file> [--output <file>]");
  console.log("");
  console.log("Options:");
  console.log("  --metadata       Path to default_makefile_metadata.json");
  console.log("  --configuration  Path to the configuration file");
  console.log("  --output         Output file (default: stdout)");
  console.log("  --help, -h       Show this help");
  console.log("");
  console.log("Example:");
  console.log("  npx ts-node metadata2makefile.ts \\");
  console.log("    --metadata ../rules/default_makefile_metadata.json \\");
  console.log("    --configuration ../rules/configuration1.json \\");
  console.log("    --output src.mk");
}

function loadJson<T>(filePath: string): T {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as T;
}

function mergeArrays(a: string[] = [], b: string[] = []): string[] {
  return [...new Set([...a, ...b])];
}

function mergeMakefileSections(
  defaults: MakefileSection,
  config: MakefileSection
): MakefileSection {
  const result: MakefileSection = { ...defaults };
  for (const [category, files] of Object.entries(config)) {
    result[category] = mergeArrays(result[category], files);
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

function generateSrcMk(
  config: Configuration,
  defaults: MakefileMetadata
): string {
  const prefixMap = defaults.$prefix_map;

  if (!prefixMap) {
    throw new Error("Metadata file missing $prefix_map");
  }

  const mergedSrcs = mergeMakefileSections(
    defaults.srcs || {},
    config.makefile.srcs || {}
  );
  const mergedIncs = mergeMakefileSections(
    defaults.incs || {},
    config.makefile.incs || {}
  );

  const lines: string[] = [];

  lines.push("# Auto-generated src.mk from metadata");
  lines.push("# Do not edit manually");
  lines.push("");

  lines.push("# Sources");
  lines.push(...generateMakefileLines(mergedSrcs, prefixMap, "SRCS"));

  lines.push("# Includes");
  lines.push(...generateMakefileLines(mergedIncs, prefixMap, "INCS"));

  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args) {
    printUsage();
    process.exit(1);
  }

  const metadataPath = path.resolve(args.metadata);
  const configPath = path.resolve(args.configuration);
  const outputPath = args.output ? path.resolve(args.output) : null;

  if (!fs.existsSync(metadataPath)) {
    console.error(`Error: Metadata file not found: ${metadataPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(configPath)) {
    console.error(`Error: Configuration file not found: ${configPath}`);
    process.exit(1);
  }

  const defaults = loadJson<MakefileMetadata>(metadataPath);
  const config = loadJson<Configuration>(configPath);

  if (!config.makefile) {
    console.error('Error: Configuration file missing "makefile" section');
    process.exit(1);
  }

  const srcMk = generateSrcMk(config, defaults);

  if (outputPath) {
    fs.writeFileSync(outputPath, srcMk);
    console.log(`Generated: ${outputPath}`);
  } else {
    console.log(srcMk);
  }
}

main();
