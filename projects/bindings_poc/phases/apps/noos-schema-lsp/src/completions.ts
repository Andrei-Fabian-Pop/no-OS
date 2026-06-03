import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
} from "vscode-languageserver";
import { CompletionContext } from "./types";
import {
  getPrimitiveTypeNames,
  getSpecialTypeNames,
  getPropertyFieldsForType,
  getTopLevelFieldsForSchemaType,
  getPrimitiveTypeInfo,
} from "./meta-schema";
import { SchemaIndexer } from "./schema-index";

export function getCompletions(
  context: CompletionContext,
  indexer: SchemaIndexer
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // Value completions take priority when cursor is after a colon
  if (context.isPropertyValue) {
    items.push(...getPropertyValueCompletions(context, indexer));
  } else if (context.isInOverride) {
    items.push(...getOverrideCompletions(context));
  } else if (context.isInArray) {
    items.push(...getArrayItemCompletions(context, indexer));
  } else if (context.isTopLevel) {
    items.push(...getTopLevelCompletions(context));
  } else if (context.isFieldProperty) {
    items.push(...getFieldPropertyCompletions(context, indexer));
  }

  return items;
}

function getTopLevelCompletions(context: CompletionContext): CompletionItem[] {
  const items: CompletionItem[] = [];
  const schemaType = context.schemaType || "struct";

  const fields = getTopLevelFieldsForSchemaType(schemaType);

  for (const field of fields) {
    items.push({
      label: field,
      kind: CompletionItemKind.Field,
      detail: getTopLevelFieldDetail(field),
      insertText: `${field}: `,
      insertTextFormat: InsertTextFormat.PlainText,
    });
  }

  items.push({
    label: "field_name",
    kind: CompletionItemKind.Property,
    detail: "Add a new field",
    insertText: "field_name:\n  type: ",
    insertTextFormat: InsertTextFormat.PlainText,
  });

  return items;
}

function getTopLevelFieldDetail(field: string): string {
  switch (field) {
    case "$id":
      return "Unique identifier for this schema";
    case "$type":
      return "Schema type: struct, enum, union, platform_ops";
    case "$name":
      return "C type name for this schema";
    case "$description":
      return "Description of this schema";
    case "$sources":
      return "Source files for this schema";
    case "$override":
      return "Override rules for field constraints";
    case "values":
      return "Enum values (for enum type)";
    case "default":
      return "Default enum value (for enum type)";
    case "symbol":
      return "Symbol name (for platform_ops)";
    default:
      return "";
  }
}

function getFieldPropertyCompletions(
  context: CompletionContext,
  _indexer: SchemaIndexer
): CompletionItem[] {
  const items: CompletionItem[] = [];
  const existing = context.existingProperties || new Set<string>();

  const availableFields = getPropertyFieldsForType(
    context.fieldHasType || false,
    context.fieldHasInclude || false,
    context.fieldType
  );

  for (const field of availableFields) {
    if (existing.has(field)) continue;

    items.push({
      label: field,
      kind: CompletionItemKind.Property,
      detail: getPropertyFieldDetail(field),
      insertText: getPropertyFieldInsertText(field),
      insertTextFormat: InsertTextFormat.PlainText,
    });
  }

  return items;
}

function getArrayItemCompletions(
  context: CompletionContext,
  indexer: SchemaIndexer
): CompletionItem[] {
  const items: CompletionItem[] = [];

  switch (context.arrayType) {
    case "platforms":
      // Inside platforms array - suggest adding new platform include
      items.push({
        label: "- include",
        kind: CompletionItemKind.Property,
        detail: "Add platform-specific include",
        insertText: "- include: ",
        insertTextFormat: InsertTextFormat.PlainText,
      });
      // Also provide include path completions
      for (const path of indexer.getIncludePaths()) {
        const schema = indexer.resolveInclude(path);
        if (schema && (path.includes("platform") || path.includes("maxim") || path.includes("xilinx") || path.includes("stm32") || path.includes("pico"))) {
          items.push({
            label: `- include: "${path}"`,
            kind: CompletionItemKind.File,
            detail: schema.name,
            documentation: schema.description,
            insertText: `- include: "${path}"`,
            insertTextFormat: InsertTextFormat.PlainText,
          });
        }
      }
      break;

    case "values":
      // Inside enum values - user defines these, no suggestions
      return [];

    case "members":
      // Inside union members - user defines these, no suggestions
      return [];
  }

  return items;
}

function getOverrideCompletions(context: CompletionContext): CompletionItem[] {
  const items: CompletionItem[] = [];
  const fieldNames = context.fieldNames || [];

  switch (context.overrideContext) {
    case "root":
      // At root of $override array - suggest rule types
      items.push(
        {
          label: "- $mutex",
          kind: CompletionItemKind.Keyword,
          detail: "Mutually exclusive fields",
          documentation: "Define fields that cannot be set together",
          insertText: "- $mutex: [${1:field1}, ${2:field2}]",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "- $if/$then",
          kind: CompletionItemKind.Keyword,
          detail: "Conditional rule",
          documentation: "Apply constraints based on field values",
          insertText: "- $if:\n    ${1:field_name}:\n      value: ${2:value}\n  $then:\n    ${3:other_field}:\n      required: true",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "- $switch",
          kind: CompletionItemKind.Keyword,
          detail: "Switch-based rule",
          documentation: "Apply different constraints based on field value",
          insertText: "- $switch:\n    $on: ${1:field_name}\n    $cases:\n      ${2:value1}:\n        ${3:other_field}:\n          required: true",
          insertTextFormat: InsertTextFormat.Snippet,
        }
      );
      break;

    case "mutex":
      // Inside $mutex array - suggest ONLY field names, nothing else
      for (const field of fieldNames) {
        items.push({
          label: field,
          kind: CompletionItemKind.Field,
          detail: "Field name",
          insertText: field,
          insertTextFormat: InsertTextFormat.PlainText,
        });
      }
      return items; // Return early - don't add any other completions

    case "value_array":
      // Inside value: [...] array - user defines these values, no suggestions
      return [];

    case "if":
    case "parent":
      // Inside $if or $parent - suggest field names with value constraint
      items.push({
        label: "$parent",
        kind: CompletionItemKind.Keyword,
        detail: "Reference parent schema field",
        insertText: "$parent:\n  ${1:field_name}:\n    value: ${2:value}",
        insertTextFormat: InsertTextFormat.Snippet,
      });
      for (const field of fieldNames) {
        items.push({
          label: field,
          kind: CompletionItemKind.Field,
          detail: "Check field value",
          insertText: `${field}:\n  value: \${1:value}`,
          insertTextFormat: InsertTextFormat.Snippet,
        });
      }
      break;

    case "then":
    case "this":
      // Inside $then or $this - suggest field modifications
      items.push({
        label: "$this",
        kind: CompletionItemKind.Keyword,
        detail: "Modify this schema's field constraints",
        insertText: "$this:\n  ${1:field_name}:\n    value: [${2:allowed_values}]",
        insertTextFormat: InsertTextFormat.Snippet,
      });
      for (const field of fieldNames) {
        items.push({
          label: field,
          kind: CompletionItemKind.Field,
          detail: "Modify field constraint",
          insertText: `${field}:\n  \${1|required,disabled,value|}: \${2:true}`,
          insertTextFormat: InsertTextFormat.Snippet,
        });
      }
      break;

    case "switch":
      // Inside $switch - suggest $on and $cases
      items.push(
        {
          label: "$on",
          kind: CompletionItemKind.Keyword,
          detail: "Field to switch on",
          insertText: "$on: ${1:field_name}",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "$cases",
          kind: CompletionItemKind.Keyword,
          detail: "Switch cases",
          insertText: "$cases:\n  ${1:value}:\n    ${2:field}:\n      required: true",
          insertTextFormat: InsertTextFormat.Snippet,
        }
      );
      break;

    case "cases":
      // Inside $cases - suggest case values and field modifications
      for (const field of fieldNames) {
        items.push({
          label: field,
          kind: CompletionItemKind.Field,
          detail: "Modify field in this case",
          insertText: `${field}:\n  \${1|required,disabled,value|}: \${2:true}`,
          insertTextFormat: InsertTextFormat.Snippet,
        });
      }
      break;

    default:
      // Generic override context - suggest all keywords
      items.push(
        {
          label: "$mutex",
          kind: CompletionItemKind.Keyword,
          detail: "Mutually exclusive fields",
        },
        {
          label: "$if",
          kind: CompletionItemKind.Keyword,
          detail: "Conditional check",
        },
        {
          label: "$then",
          kind: CompletionItemKind.Keyword,
          detail: "Conditional action",
        },
        {
          label: "$switch",
          kind: CompletionItemKind.Keyword,
          detail: "Switch statement",
        },
        {
          label: "$parent",
          kind: CompletionItemKind.Keyword,
          detail: "Reference parent schema",
        },
        {
          label: "$this",
          kind: CompletionItemKind.Keyword,
          detail: "Reference this schema",
        }
      );
      break;
  }

  return items;
}

function getPropertyFieldDetail(field: string): string {
  switch (field) {
    case "type":
      return "Primitive or special type";
    case "include":
      return "Include another schema";
    case "pointer":
      return "Whether this is a pointer";
    case "required":
      return "Whether this field is required";
    case "description":
      return "Field description";
    case "default":
      return "Default value";
    case "minimum":
      return "Minimum value (numeric types)";
    case "maximum":
      return "Maximum value (numeric types)";
    case "values":
      return "Enum values";
    case "element":
      return "Array element type";
    case "size":
      return "Array size";
    case "platforms":
      return "Platform-specific includes";
    case "target":
      return "Target schema for const_ptr/platform_ops";
    case "selector":
      return "Union selector field";
    case "members":
      return "Union member definitions";
    default:
      return "";
  }
}

function getPropertyFieldInsertText(field: string): string {
  switch (field) {
    case "pointer":
    case "required":
      return `${field}: true`;
    case "element":
      return `${field}:\n    type: `;
    case "platforms":
      return `${field}:\n    - include: `;
    case "members":
      return `${field}:\n    `;
    default:
      return `${field}: `;
  }
}

function getPropertyValueCompletions(
  context: CompletionContext,
  indexer: SchemaIndexer
): CompletionItem[] {
  const items: CompletionItem[] = [];
  const prop = context.currentProperty;

  if (!prop) return items;

  switch (prop) {
    case "type":
      items.push(...getTypeCompletions());
      break;
    case "include":
      items.push(...getIncludeCompletions(indexer));
      break;
    case "pointer":
    case "required":
      items.push(...getBooleanCompletions());
      break;
    case "$type":
      items.push(...getSchemaTypeCompletions());
      break;
    case "default":
      if (context.fieldType === "bool") {
        items.push(...getBooleanCompletions());
      } else if (context.fieldType) {
        const typeInfo = getPrimitiveTypeInfo(context.fieldType);
        if (typeInfo) {
          items.push({
            label: "0",
            kind: CompletionItemKind.Value,
            detail: `Default ${context.fieldType} value`,
          });
        }
      }
      break;
  }

  return items;
}

function getTypeCompletions(): CompletionItem[] {
  const items: CompletionItem[] = [];

  for (const type of getPrimitiveTypeNames()) {
    const info = getPrimitiveTypeInfo(type);
    items.push({
      label: type,
      kind: CompletionItemKind.TypeParameter,
      detail: info?.description || "Primitive type",
      documentation: info
        ? `Range: ${info.min ?? "N/A"} to ${info.max ?? "N/A"}`
        : undefined,
    });
  }

  for (const type of getSpecialTypeNames()) {
    items.push({
      label: type,
      kind: CompletionItemKind.TypeParameter,
      detail: getSpecialTypeDetail(type),
    });
  }

  return items;
}

function getSpecialTypeDetail(type: string): string {
  switch (type) {
    case "enum":
      return "Enumeration type";
    case "union":
      return "Union type with selector";
    case "const_ptr":
      return "Constant pointer to another type";
    case "platform_extra":
      return "Platform-specific extra fields";
    case "platform_ops":
      return "Platform-specific operations";
    case "array":
      return "Fixed-size array";
    default:
      return "Special type";
  }
}

function getIncludeCompletions(indexer: SchemaIndexer): CompletionItem[] {
  const items: CompletionItem[] = [];
  const paths = indexer.getIncludePaths();

  for (const includePath of paths) {
    const schema = indexer.resolveInclude(includePath);
    items.push({
      label: includePath,
      kind: CompletionItemKind.File,
      detail: schema?.name || "Schema",
      documentation: schema?.description,
      insertText: `"${includePath}"`,
    });
  }

  return items;
}

function getBooleanCompletions(): CompletionItem[] {
  return [
    {
      label: "true",
      kind: CompletionItemKind.Value,
      detail: "Boolean true",
    },
    {
      label: "false",
      kind: CompletionItemKind.Value,
      detail: "Boolean false",
    },
  ];
}

function getSchemaTypeCompletions(): CompletionItem[] {
  return [
    {
      label: "struct",
      kind: CompletionItemKind.EnumMember,
      detail: "C struct definition",
    },
    {
      label: "enum",
      kind: CompletionItemKind.EnumMember,
      detail: "C enum definition",
    },
    {
      label: "union",
      kind: CompletionItemKind.EnumMember,
      detail: "C union definition",
    },
    {
      label: "platform_ops",
      kind: CompletionItemKind.EnumMember,
      detail: "Platform operations table",
    },
  ];
}
