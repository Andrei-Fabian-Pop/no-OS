import { Hover, MarkupContent, MarkupKind, Position } from "vscode-languageserver";
import { SchemaDocument, FieldDefinition } from "./types";
import { getPrimitiveTypeInfo, isPrimitiveType, isSpecialType } from "./meta-schema";
import { SchemaIndexer } from "./schema-index";

export function getHover(
  content: string,
  position: Position,
  doc: SchemaDocument | null,
  indexer: SchemaIndexer
): Hover | null {
  const lines = content.split("\n");
  const line = lines[position.line] || "";

  const keyMatch = line.match(/^(\s*)(\$?\w+):/);
  if (keyMatch) {
    const keyStart = keyMatch[1].length;
    const keyEnd = keyStart + keyMatch[2].length;
    const key = keyMatch[2];

    if (position.character >= keyStart && position.character <= keyEnd) {
      return getKeyHover(key, doc, line);
    }
  }

  const typeMatch = line.match(/^\s+type:\s+(\w+)/);
  if (typeMatch) {
    const typeName = typeMatch[1];
    const typeStart = line.indexOf(typeName);
    const typeEnd = typeStart + typeName.length;

    if (position.character >= typeStart && position.character <= typeEnd) {
      return getTypeHover(typeName);
    }
  }

  const includeMatch = line.match(/^\s+include:\s+["']?([^"'\n]+)["']?/);
  if (includeMatch) {
    const includePath = includeMatch[1];
    const pathStart = line.indexOf(includePath);
    const pathEnd = pathStart + includePath.length;

    if (position.character >= pathStart && position.character <= pathEnd) {
      return getIncludeHover(includePath, indexer);
    }
  }

  return null;
}

function getKeyHover(
  key: string,
  doc: SchemaDocument | null,
  line: string
): Hover | null {
  if (key.startsWith("$")) {
    return getMetaFieldHover(key);
  }

  const indent = line.search(/\S/);

  if (indent === 0 && doc) {
    const fieldNode = doc.fields.get(key);
    if (fieldNode) {
      return getFieldHover(key, fieldNode.value, doc);
    }
  }

  if (indent > 0) {
    return getPropertyHover(key);
  }

  return null;
}

function getMetaFieldHover(key: string): Hover | null {
  const descriptions: Record<string, string> = {
    $id: "**$id**\n\nUnique identifier for this schema. Used for include resolution and code generation.",
    $type: "**$type**\n\nSchema type. One of:\n- `struct`: C struct definition\n- `enum`: C enum definition\n- `union`: C union definition\n- `platform_ops`: Platform-specific operations table",
    $name: "**$name**\n\nThe C type name that will be generated. This becomes the struct, enum, or union name in the generated code.",
    $description: "**$description**\n\nDocumentation for this schema. Used in generated code comments and IDE hover.",
    $sources: "**$sources**\n\nSource file configuration:\n- `headers`: Header files\n- `sources`: Implementation files\n- `api`: API-specific sources\n- `platform`: Platform-specific sources\n- `sdk`: SDK-specific sources",
    $override: "**$override**\n\nField constraint rules:\n- `$mutex`: Mutually exclusive fields\n- `$if/$then`: Conditional requirements\n- `$switch`: Switch-based requirements\n- `$parent`: Nested rules",
  };

  const desc = descriptions[key];
  if (!desc) return null;

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: desc,
    },
  };
}

function getFieldHover(
  fieldName: string,
  field: FieldDefinition,
  doc: SchemaDocument
): Hover | null {
  const parts: string[] = [];

  parts.push(`**${fieldName}**`);

  if (field.description?.value) {
    parts.push("");
    parts.push(field.description.value);
  }

  parts.push("");

  if (field.type?.value) {
    parts.push(`**Type:** \`${field.type.value}\``);
  }

  if (field.include?.value) {
    parts.push(`**Include:** \`${field.include.value}\``);
  }

  if (field.pointer?.value) {
    parts.push(`**Pointer:** yes`);
  }

  if (field.required?.value) {
    parts.push(`**Required:** yes`);
  }

  if (field.default?.value !== undefined) {
    parts.push(`**Default:** \`${JSON.stringify(field.default.value)}\``);
  }

  if (field.minimum?.value !== undefined) {
    parts.push(`**Minimum:** ${field.minimum.value}`);
  }

  if (field.maximum?.value !== undefined) {
    parts.push(`**Maximum:** ${field.maximum.value}`);
  }

  if (field.size?.value !== undefined) {
    parts.push(`**Size:** ${field.size.value}`);
  }

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: parts.join("\n"),
    },
  };
}

function getPropertyHover(key: string): Hover | null {
  const descriptions: Record<string, string> = {
    type: "**type**\n\nThe data type for this field. Can be:\n- Primitive: `uint8_t`, `uint16_t`, `uint32_t`, `int8_t`, `int16_t`, `int32_t`, `bool`, `size_t`\n- Special: `enum`, `union`, `array`, `const_ptr`, `platform_extra`, `platform_ops`",
    include: "**include**\n\nPath to another schema to include. The field will use that schema's type.\n\nMutually exclusive with `type`.",
    pointer: "**pointer**\n\nWhether this field is a pointer. Only valid with `include`.\n\n`true` or `false`",
    required: "**required**\n\nWhether this field must be provided during initialization.\n\n`true` or `false`",
    description: "**description**\n\nDocumentation for this field. Used in generated code comments.",
    default: "**default**\n\nDefault value for this field when not specified.",
    minimum: "**minimum**\n\nMinimum allowed value. Only valid for numeric primitive types.",
    maximum: "**maximum**\n\nMaximum allowed value. Only valid for numeric primitive types.",
    values: "**values**\n\nEnum values mapping. Keys are value names, values contain descriptions.",
    element: "**element**\n\nArray element definition. Contains `type` or `include` for array elements.",
    size: "**size**\n\nFixed array size.",
    platforms: "**platforms**\n\nPlatform-specific includes. Each entry has an `include` path.",
    target: "**target**\n\nTarget schema for `const_ptr` or `platform_ops`.",
    selector: "**selector**\n\nField name that selects the active union member.",
    members: "**members**\n\nUnion member definitions keyed by selector value.",
  };

  const desc = descriptions[key];
  if (!desc) return null;

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: desc,
    },
  };
}

function getTypeHover(typeName: string): Hover | null {
  if (isPrimitiveType(typeName)) {
    const info = getPrimitiveTypeInfo(typeName);
    if (info) {
      const parts = [
        `**${typeName}**`,
        "",
        info.description,
        "",
        `**C Type:** \`${info.cType}\``,
        `**Size:** ${info.sizeBits === "platform_dependent" ? "Platform dependent" : `${info.sizeBits} bits`}`,
      ];

      if (info.min !== undefined && info.max !== undefined) {
        parts.push(`**Range:** ${info.min} to ${info.max}`);
      }

      if (info.signed !== undefined) {
        parts.push(`**Signed:** ${info.signed ? "yes" : "no"}`);
      }

      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: parts.join("\n"),
        },
      };
    }
  }

  if (isSpecialType(typeName)) {
    const descriptions: Record<string, string> = {
      enum: "**enum**\n\nInline enumeration type.\n\nRequires `values` property defining enum members.",
      union: "**union**\n\nTagged union type.\n\nRequires:\n- `selector`: Field that determines active member\n- `members`: Member definitions",
      array: "**array**\n\nFixed-size array type.\n\nRequires:\n- `size`: Array length\n- `element`: Element type definition",
      const_ptr: "**const_ptr**\n\nConstant pointer to another type.\n\nRequires `target` property.",
      platform_extra: "**platform_extra**\n\nPlatform-specific extra fields.\n\nRequires `platforms` property.",
      platform_ops: "**platform_ops**\n\nPlatform-specific operations table.\n\nRequires:\n- `platforms`: Platform implementations\n- `target`: Operations struct",
    };

    const desc = descriptions[typeName];
    if (desc) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: desc,
        },
      };
    }
  }

  return null;
}

function getIncludeHover(
  includePath: string,
  indexer: SchemaIndexer
): Hover | null {
  const schema = indexer.resolveInclude(includePath);

  if (!schema) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**Cannot resolve:** \`${includePath}\`\n\nSchema not found in index.`,
      },
    };
  }

  const parts = [
    `**${schema.name}**`,
    "",
    schema.description || "_No description_",
    "",
    `**Type:** ${schema.type}`,
    `**ID:** ${schema.id}`,
    `**File:** ${schema.filePath}`,
  ];

  if (schema.fields.length > 0) {
    parts.push("");
    parts.push("**Fields:**");
    for (const field of schema.fields.slice(0, 10)) {
      parts.push(`- ${field}`);
    }
    if (schema.fields.length > 10) {
      parts.push(`- _...and ${schema.fields.length - 10} more_`);
    }
  }

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: parts.join("\n"),
    },
  };
}
