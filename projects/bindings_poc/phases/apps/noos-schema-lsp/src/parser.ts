import { Position, Range } from "vscode-languageserver";
import * as YAML from "yaml";
import {
  SchemaDocument,
  SchemaType,
  FieldDefinition,
  NodeWithRange,
  SourceRange,
  CompletionContext,
} from "./types";

export interface ParseResult {
  document: SchemaDocument | null;
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  range: Range;
}

function yamlPosToLspPos(pos: { line: number; col: number }): Position {
  return { line: pos.line - 1, character: pos.col - 1 };
}

function getNodeRange(node: YAML.Node | null | undefined): SourceRange | null {
  if (!node || !node.range) return null;
  const doc = node as unknown as { srcToken?: { offset: number } };

  if (node.range && node.range.length >= 2) {
    return {
      start: { line: 0, character: node.range[0] },
      end: { line: 0, character: node.range[1] },
    };
  }
  return null;
}

export function parseYamlDocument(content: string): ParseResult {
  const errors: ParseError[] = [];

  let doc: YAML.Document;
  try {
    doc = YAML.parseDocument(content, {
      keepSourceTokens: true,
      strict: false,
    });
  } catch (e) {
    const err = e as Error;
    errors.push({
      message: `YAML parse error: ${err.message}`,
      range: Range.create(0, 0, 0, 1),
    });
    return { document: null, errors };
  }

  for (const error of doc.errors) {
    const pos = error.pos ? error.pos[0] : 0;
    const line = content.substring(0, pos).split("\n").length - 1;
    const col = pos - content.lastIndexOf("\n", pos - 1) - 1;
    errors.push({
      message: error.message,
      range: Range.create(line, col, line, col + 1),
    });
  }

  if (!doc.contents || !YAML.isMap(doc.contents)) {
    if (doc.errors.length === 0) {
      errors.push({
        message: "Schema must be a YAML mapping",
        range: Range.create(0, 0, 0, 1),
      });
    }
    return { document: null, errors };
  }

  const raw = doc.toJS() as Record<string, unknown>;
  const schema = parseSchemaFromMap(doc.contents, raw, content);

  return { document: schema, errors };
}

function parseSchemaFromMap(
  map: YAML.YAMLMap,
  raw: Record<string, unknown>,
  content: string
): SchemaDocument {
  const fields = new Map<string, NodeWithRange<FieldDefinition>>();

  const schema: SchemaDocument = {
    fields,
    raw,
    documentRange: {
      start: { line: 0, character: 0 },
      end: Position.create(
        content.split("\n").length - 1,
        content.split("\n").pop()?.length || 0
      ),
    },
  };

  for (const item of map.items) {
    const keyNode = item.key;
    const valueNode = item.value;

    if (!YAML.isScalar(keyNode)) continue;
    const key = String(keyNode.value);

    const keyRange = getKeyRange(keyNode, content);

    if (key === "$id") {
      schema.$id = {
        value: String(valueNode && YAML.isScalar(valueNode) ? valueNode.value : ""),
        range: keyRange,
      };
    } else if (key === "$type") {
      schema.$type = {
        value: String(valueNode && YAML.isScalar(valueNode) ? valueNode.value : "") as SchemaType,
        range: keyRange,
      };
    } else if (key === "$name") {
      schema.$name = {
        value: String(valueNode && YAML.isScalar(valueNode) ? valueNode.value : ""),
        range: keyRange,
      };
    } else if (key === "$description") {
      schema.$description = {
        value: String(valueNode && YAML.isScalar(valueNode) ? valueNode.value : ""),
        range: keyRange,
      };
    } else if (key === "$sources") {
      schema.$sources = {
        value: raw.$sources as any,
        range: keyRange,
      };
    } else if (key === "$override") {
      schema.$override = {
        value: raw.$override as any,
        range: keyRange,
      };
    } else if (key === "values" && raw.$type === "enum") {
      schema.values = {
        value: raw.values as any,
        range: keyRange,
      };
    } else if (key === "default" && raw.$type === "enum") {
      schema.default = {
        value: String(valueNode && YAML.isScalar(valueNode) ? valueNode.value : ""),
        range: keyRange,
      };
    } else if (!key.startsWith("$")) {
      const fieldDef = parseFieldDefinition(valueNode as YAML.Node | null, raw[key], content);
      fields.set(key, {
        value: fieldDef,
        range: keyRange,
      });
    }
  }

  return schema;
}

function getKeyRange(keyNode: YAML.Scalar, content: string): SourceRange {
  if (keyNode.range) {
    const startOffset = keyNode.range[0];
    const endOffset = keyNode.range[1];
    const beforeStart = content.substring(0, startOffset);
    const startLine = beforeStart.split("\n").length - 1;
    const lastNewline = beforeStart.lastIndexOf("\n");
    const startCol = startOffset - lastNewline - 1;

    const beforeEnd = content.substring(0, endOffset);
    const endLine = beforeEnd.split("\n").length - 1;
    const lastNewlineEnd = beforeEnd.lastIndexOf("\n");
    const endCol = endOffset - lastNewlineEnd - 1;

    return {
      start: { line: startLine, character: startCol },
      end: { line: endLine, character: endCol },
    };
  }
  return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
}

function parseFieldDefinition(
  valueNode: YAML.Node | null,
  rawValue: unknown,
  content: string
): FieldDefinition {
  const field: FieldDefinition = {};

  if (!valueNode || !YAML.isMap(valueNode) || typeof rawValue !== "object" || rawValue === null) {
    return field;
  }

  const raw = rawValue as Record<string, unknown>;

  for (const item of (valueNode as YAML.YAMLMap).items) {
    const keyNode = item.key;
    if (!YAML.isScalar(keyNode)) continue;
    const key = String(keyNode.value);
    const keyRange = getKeyRange(keyNode, content);
    const val = raw[key];

    switch (key) {
      case "type":
        field.type = { value: String(val), range: keyRange };
        break;
      case "include":
        field.include = { value: String(val), range: keyRange };
        break;
      case "pointer":
        field.pointer = { value: Boolean(val), range: keyRange, rawValue: val };
        break;
      case "required":
        field.required = { value: Boolean(val), range: keyRange, rawValue: val };
        break;
      case "description":
        field.description = { value: String(val), range: keyRange };
        break;
      case "default":
        field.default = { value: val, range: keyRange };
        break;
      case "minimum":
        field.minimum = { value: Number(val), range: keyRange };
        break;
      case "maximum":
        field.maximum = { value: Number(val), range: keyRange };
        break;
      case "size":
        field.size = { value: Number(val), range: keyRange };
        break;
      case "values":
        field.values = { value: val as string[], range: keyRange };
        break;
      case "element":
        field.element = { value: val as any, range: keyRange };
        break;
      case "platforms":
        field.platforms = { value: val as any, range: keyRange };
        break;
      case "target":
        field.target = { value: String(val), range: keyRange };
        break;
      case "selector":
        field.selector = { value: String(val), range: keyRange };
        break;
      case "members":
        field.members = { value: val as any, range: keyRange };
        break;
    }
  }

  return field;
}

export function getCompletionContext(
  content: string,
  position: Position
): CompletionContext {
  const lines = content.split("\n");
  const line = lines[position.line] || "";
  const lineUpToCursor = line.substring(0, position.character);

  // Calculate indent: use cursor position for empty/whitespace-only lines
  const firstNonWhitespace = line.search(/\S/);
  const indent = firstNonWhitespace === -1 ? position.character : firstNonWhitespace;

  // Check if we're inside a field by looking at surrounding context
  let insideField = false;
  let currentField: string | undefined;
  let existingProperties: Set<string> | undefined;
  let fieldHasType = false;
  let fieldHasInclude = false;
  let fieldType: string | undefined;
  let includeValue: string | undefined;

  // Look backward to find if we're inside a field definition
  for (let i = position.line; i >= 0; i--) {
    const prevLine = lines[i];
    const prevIndent = prevLine.search(/\S/);

    // Skip empty lines
    if (prevIndent === -1) continue;

    // Found a top-level field definition
    if (prevIndent === 0 && prevLine.match(/^(\w+):/)) {
      const match = prevLine.match(/^(\w+):/);
      if (match && !match[1].startsWith("$")) {
        currentField = match[1];
        insideField = indent > 0;
      }
      break;
    }

    // Found a top-level $ field - we're at top level
    if (prevIndent === 0 && prevLine.match(/^\$/)) {
      break;
    }
  }

  // If inside a field, scan for existing properties (both above and below cursor)
  if (currentField) {
    existingProperties = new Set<string>();

    // Find the field's start line
    let fieldStartLine = -1;
    for (let i = position.line; i >= 0; i--) {
      const prevLine = lines[i];
      if (prevLine.match(/^\w+:/) && !prevLine.match(/^\$/)) {
        fieldStartLine = i;
        break;
      }
    }

    // Scan all properties of this field
    if (fieldStartLine >= 0) {
      for (let i = fieldStartLine + 1; i < lines.length; i++) {
        const scanLine = lines[i];
        const scanIndent = scanLine.search(/\S/);

        // Stop at next top-level element
        if (scanIndent === 0 && scanLine.trim().length > 0) break;

        // Property at indent 2
        if (scanIndent === 2) {
          const propMatch = scanLine.match(/^\s+(\w+):/);
          if (propMatch) {
            existingProperties.add(propMatch[1]);
            if (propMatch[1] === "type") {
              fieldHasType = true;
              const typeMatch = scanLine.match(/^\s+type:\s+(\S+)/);
              if (typeMatch) {
                fieldType = typeMatch[1];
              }
            }
            if (propMatch[1] === "include") {
              fieldHasInclude = true;
              const includeMatch = scanLine.match(/^\s+include:\s+["']?([^"'\s]+)["']?/);
              if (includeMatch) {
                includeValue = includeMatch[1];
              }
            }
          }
        }
      }
    }
  }

  const isTopLevel = !insideField && indent === 0;

  // Check if we're inside an array (platforms, values, members)
  let isInArray = false;
  let arrayType: "platforms" | "values" | "members" | undefined;

  if (insideField && indent >= 4) {
    // Look backward to find the array property
    for (let i = position.line; i >= 0; i--) {
      const prevLine = lines[i];
      const prevIndent = prevLine.search(/\S/);

      // Stop at field level
      if (prevIndent === 0) break;

      // Found array property at indent 2
      if (prevIndent === 2) {
        if (prevLine.match(/^\s+platforms:/)) {
          isInArray = true;
          arrayType = "platforms";
        } else if (prevLine.match(/^\s+values:/)) {
          isInArray = true;
          arrayType = "values";
        } else if (prevLine.match(/^\s+members:/)) {
          isInArray = true;
          arrayType = "members";
        }
        break;
      }
    }
  }

  // Match after colon - cursor is in value position
  const valuePositionMatch = lineUpToCursor.match(/^(\s*)(\$?\w+):\s*(.*)$/);
  const isPropertyValue = valuePositionMatch !== null && lineUpToCursor.includes(":");

  // Get the current property name when in value position
  let currentProperty: string | undefined;
  if (valuePositionMatch) {
    currentProperty = valuePositionMatch[2];
  }

  let schemaType: SchemaType | undefined;
  for (const l of lines) {
    const typeMatch = l.match(/^\$type:\s+(\w+)/);
    if (typeMatch) {
      schemaType = typeMatch[1] as SchemaType;
      break;
    }
  }

  // Collect all field names for $override suggestions
  const fieldNames: string[] = [];
  for (const l of lines) {
    const fieldMatch = l.match(/^(\w+):/);
    if (fieldMatch && !fieldMatch[1].startsWith("$")) {
      fieldNames.push(fieldMatch[1]);
    }
  }

  // Check if we're inside $override section
  let isInOverride = false;
  let overrideContext: "root" | "mutex" | "if" | "then" | "switch" | "cases" | "parent" | "this" | "value_array" | undefined;

  // First check if we're inside a $mutex array on the current line
  // e.g., "  - $mutex: [field1, |" where | is cursor
  const mutexMatch = line.match(/\$mutex:\s*\[/);
  if (mutexMatch) {
    const bracketStart = line.indexOf("[");
    const bracketEnd = line.indexOf("]");
    // Cursor is inside brackets if after [ and before ] (or no closing ])
    if (bracketStart !== -1 && position.character > bracketStart && (bracketEnd === -1 || position.character <= bracketEnd)) {
      isInOverride = true;
      overrideContext = "mutex";
    }
  }

  // Check if we're inside a value: [...] array (user-defined values, no suggestions)
  // Handle multiple formats:
  // 1. value: [item1, item2]
  // 2. value:
  //      [
  //        item1,
  //        item2,
  //      ]
  if (!overrideContext) {
    let inValueArray = false;
    let openBrackets = 0;
    let foundValueKey = false;

    // Scan backward from current line to detect if we're inside a value array
    for (let i = position.line; i >= 0; i--) {
      const checkLine = lines[i];
      const checkIndent = checkLine.search(/\S/);

      // Skip empty lines
      if (checkIndent === -1) continue;

      // Count brackets on this line (going backwards, so ] adds, [ subtracts)
      for (let j = checkLine.length - 1; j >= 0; j--) {
        if (checkLine[j] === "]") openBrackets++;
        if (checkLine[j] === "[") openBrackets--;
      }

      // Check if this line has "value:"
      if (checkLine.match(/\bvalue:\s*$/)) {
        // value: on its own line, array starts on next line
        if (openBrackets < 0) {
          foundValueKey = true;
          inValueArray = true;
        }
        break;
      }

      if (checkLine.match(/\bvalue:\s*\[/)) {
        // value: [ on same line
        if (openBrackets <= 0) {
          foundValueKey = true;
          inValueArray = true;
        }
        break;
      }

      // Stop at $override or top-level
      if (checkLine.match(/^\$override:/)) {
        if (inValueArray) {
          isInOverride = true;
          overrideContext = "value_array";
        }
        break;
      }

      if (checkIndent === 0 && !checkLine.match(/^\$override:/)) {
        break;
      }
    }

    // If we found we're in a value array, confirm we're in $override section
    if (inValueArray && !overrideContext) {
      for (let i = position.line; i >= 0; i--) {
        const checkLine = lines[i];
        if (checkLine.match(/^\$override:/)) {
          isInOverride = true;
          overrideContext = "value_array";
          break;
        }
        if (checkLine.search(/\S/) === 0 && !checkLine.match(/^\$override:/)) {
          break;
        }
      }
    }
  }

  // Look backward to detect $override context
  if (!overrideContext) {
    for (let i = position.line; i >= 0; i--) {
      const prevLine = lines[i];
      const prevIndent = prevLine.search(/\S/);

      if (prevIndent === -1) continue;

      // Check for $override section
      if (prevLine.match(/^\$override:/)) {
        isInOverride = true;
        if (!overrideContext) {
          overrideContext = "root";
        }
        break;
      }

      // Stop if we hit another top-level field
      if (prevIndent === 0 && !prevLine.match(/^\$override:/)) {
        break;
      }

      // Detect specific override contexts based on keywords
      // Use more specific patterns and check current line context
      if (i === position.line) {
        // On current line, check what keyword we're after
        if (lineUpToCursor.match(/\$this:\s*$/)) {
          overrideContext = "this";
        } else if (lineUpToCursor.match(/\$then:\s*$/)) {
          overrideContext = "then";
        } else if (lineUpToCursor.match(/\$if:\s*$/)) {
          overrideContext = "if";
        } else if (lineUpToCursor.match(/\$cases:\s*$/)) {
          overrideContext = "cases";
        } else if (lineUpToCursor.match(/\$switch:\s*$/)) {
          overrideContext = "switch";
        } else if (lineUpToCursor.match(/\$parent:\s*$/)) {
          overrideContext = "parent";
        }
      } else {
        // On previous lines, detect context hierarchy
        if (prevLine.match(/\$this:/) && !overrideContext) {
          overrideContext = "this";
        } else if (prevLine.match(/\$then:/) && !overrideContext) {
          overrideContext = "then";
        } else if (prevLine.match(/\$if:/) && !overrideContext) {
          overrideContext = "if";
        } else if (prevLine.match(/\$cases:/) && !overrideContext) {
          overrideContext = "cases";
        } else if (prevLine.match(/\$switch:/) && !overrideContext) {
          overrideContext = "switch";
        } else if (prevLine.match(/\$parent:/) && !overrideContext) {
          overrideContext = "parent";
        } else if (prevLine.match(/\$mutex:/) && !overrideContext) {
          // Only set mutex context if we're on a line that continues the array
          // Check if the mutex array spans multiple lines (no closing bracket)
          if (!prevLine.includes("]")) {
            overrideContext = "mutex";
          }
        }
      }
    }
  }

  return {
    position,
    line,
    isTopLevel: isTopLevel && !isInOverride,
    isFieldProperty: insideField && !isPropertyValue && !isInArray,
    isPropertyValue,
    isInArray,
    arrayType,
    isInOverride,
    overrideContext,
    currentField,
    currentProperty,
    schemaType,
    existingProperties,
    fieldNames,
    fieldHasType,
    fieldHasInclude,
    fieldType,
    includeValue,
  };
}

export function findNodeAtPosition(
  content: string,
  position: Position
): { type: "key" | "value"; key: string; path: string[] } | null {
  const lines = content.split("\n");
  const line = lines[position.line] || "";

  const keyMatch = line.match(/^(\s*)(\$?\w+):/);
  if (keyMatch) {
    const keyStart = keyMatch[1].length;
    const keyEnd = keyStart + keyMatch[2].length;
    if (position.character >= keyStart && position.character <= keyEnd) {
      return { type: "key", key: keyMatch[2], path: [] };
    }
  }

  const valueMatch = line.match(/^(\s*)(\$?\w+):\s*["']?([^"'\n]*)["']?/);
  if (valueMatch) {
    const valueStart = valueMatch[1].length + valueMatch[2].length + 1;
    if (position.character >= valueStart) {
      return { type: "value", key: valueMatch[2], path: [] };
    }
  }

  return null;
}
