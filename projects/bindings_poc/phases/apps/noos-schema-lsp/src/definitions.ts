import { Location, Position, Range } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { SchemaDocument } from "./types";
import { SchemaIndexer } from "./schema-index";

export function getDefinition(
  content: string,
  position: Position,
  doc: SchemaDocument | null,
  indexer: SchemaIndexer
): Location | null {
  const lines = content.split("\n");
  const line = lines[position.line] || "";

  const includeMatch = line.match(/^\s+include:\s+["']?([^"'\n]+)["']?/);
  if (includeMatch) {
    const includePath = includeMatch[1];
    const pathStart = line.indexOf(includePath);
    const pathEnd = pathStart + includePath.length;

    if (position.character >= pathStart && position.character <= pathEnd) {
      return getIncludeDefinition(includePath, indexer);
    }
  }

  const targetMatch = line.match(/^\s+target:\s+["']?([^"'\n]+)["']?/);
  if (targetMatch) {
    const targetPath = targetMatch[1];
    const pathStart = line.indexOf(targetPath);
    const pathEnd = pathStart + targetPath.length;

    if (position.character >= pathStart && position.character <= pathEnd) {
      return getIncludeDefinition(targetPath, indexer);
    }
  }

  const platformIncludeMatch = line.match(/^\s+-?\s*include:\s+["']?([^"'\n]+)["']?/);
  if (platformIncludeMatch) {
    const includePath = platformIncludeMatch[1];
    const pathStart = line.indexOf(includePath);
    const pathEnd = pathStart + includePath.length;

    if (position.character >= pathStart && position.character <= pathEnd) {
      return getIncludeDefinition(includePath, indexer);
    }
  }

  const elementIncludeMatch = line.match(/^\s+include:\s+["']?([^"'\n]+)["']?/);
  if (elementIncludeMatch) {
    const includePath = elementIncludeMatch[1];
    const pathStart = line.indexOf(includePath);
    const pathEnd = pathStart + includePath.length;

    if (position.character >= pathStart && position.character <= pathEnd) {
      return getIncludeDefinition(includePath, indexer);
    }
  }

  return null;
}

function getIncludeDefinition(
  includePath: string,
  indexer: SchemaIndexer
): Location | null {
  const schema = indexer.resolveInclude(includePath);

  if (!schema) {
    return null;
  }

  const uri = URI.file(schema.filePath).toString();

  return {
    uri,
    range: Range.create(0, 0, 0, 0),
  };
}

export function getReferences(
  uri: string,
  position: Position,
  doc: SchemaDocument | null,
  indexer: SchemaIndexer
): Location[] {
  return [];
}
