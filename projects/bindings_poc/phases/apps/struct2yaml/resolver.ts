import * as fs from "fs";
import * as path from "path";
import * as YAML from "yaml";
import { SchemaIndex, PRIMITIVE_TYPES } from "./types";

export function buildSchemaIndex(schemasDir: string): SchemaIndex {
  const index: SchemaIndex = {};

  function scanDir(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith(".yaml")) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const parsed = YAML.parse(content);

          if (parsed && parsed.$name && parsed.$id) {
            index[parsed.$name] = parsed.$id;
          }
        } catch (e) {
          // Skip invalid YAML files
        }
      }
    }
  }

  scanDir(schemasDir);
  return index;
}

export interface ResolveResult {
  includePath: string | null;
  warning: string | null;
}

export interface ResolveContext {
  headerPath: string;
  schemasPath: string;
  noosRoot: string;
}

export function resolveInclude(
  typeName: string,
  schemaIndex: SchemaIndex,
  isUnionField: boolean = false,
  context?: ResolveContext
): ResolveResult {
  if (PRIMITIVE_TYPES.has(typeName)) {
    return { includePath: null, warning: null };
  }

  if (schemaIndex[typeName]) {
    return { includePath: schemaIndex[typeName], warning: null };
  }

  let typeKind: string;
  if (isUnionField) {
    typeKind = "union";
  } else if (typeName.includes("_") && !typeName.endsWith("_init_param") && !typeName.endsWith("_dev") && !typeName.endsWith("_desc")) {
    typeKind = "enum";
  } else {
    typeKind = "struct";
  }

  let command = `npx ts-node struct2yaml.ts`;
  if (context) {
    command += ` --file ${context.headerPath} --${typeKind} ${typeName} --schemas ${context.schemasPath} --noos-root ${context.noosRoot}`;
  } else {
    command += ` --file <header-path> --${typeKind} ${typeName} --schemas <schemas-dir> --noos-root <noos-root>`;
  }

  const warning = `Warning: No schema found for ${typeKind} '${typeName}'. Consider running:\n  ${command}`;

  return {
    includePath: `TODO: create schema for ${typeName}`,
    warning,
  };
}

export function generateSchemaId(
  name: string,
  type: "struct" | "union" | "enum",
  headerPath: string,
  schemaDir: string | null
): string {
  if (schemaDir) {
    return `${schemaDir}/${name}.yaml`;
  }

  if (name.startsWith("no_os_")) {
    if (type === "enum") {
      return `no-os/enums/${name}.yaml`;
    }
    if (type === "union") {
      return `no-os/unions/${name}.yaml`;
    }
    return `no-os/${name}.yaml`;
  }

  const driverMatch = headerPath.match(/drivers\/[^/]+\/([^/]+)\//);
  if (driverMatch) {
    const deviceName = driverMatch[1];
    if (type === "enum") {
      return `devices/${deviceName}-enums/${name}.yaml`;
    }
    if (type === "union") {
      return `devices/${deviceName}-unions/${name}.yaml`;
    }
    return `devices/${deviceName}/${name}.yaml`;
  }

  const prefixMatch = name.match(/^([a-z]+\d*[a-z]*)_/i);
  if (prefixMatch) {
    const prefix = prefixMatch[1].toLowerCase();
    if (type === "enum") {
      return `devices/${prefix}-enums/${name}.yaml`;
    }
    if (type === "union") {
      return `devices/${prefix}-unions/${name}.yaml`;
    }
    return `devices/${prefix}/${name}.yaml`;
  }

  if (type === "enum") {
    return `misc/enums/${name}.yaml`;
  }
  if (type === "union") {
    return `misc/unions/${name}.yaml`;
  }
  return `misc/${name}.yaml`;
}
