import { Range } from "vscode-languageserver";
import {
  SchemaDocument,
  FieldDefinition,
  ValidationDiagnostic,
  NodeWithRange,
} from "./types";
import {
  loadMetaSchema,
  isPrimitiveType,
  isSpecialType,
  getPrimitiveTypeInfo,
} from "./meta-schema";
import { SchemaIndexer } from "./schema-index";

const metaSchema = loadMetaSchema();

export function validateSchema(
  doc: SchemaDocument,
  indexer: SchemaIndexer
): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];

  validateRequiredTopLevel(doc, diagnostics);
  validateSchemaType(doc, diagnostics);
  validateFields(doc, indexer, diagnostics);
  validateOverride(doc, diagnostics);

  return diagnostics;
}

function validateRequiredTopLevel(
  doc: SchemaDocument,
  diagnostics: ValidationDiagnostic[]
): void {
  const required = ["$id", "$type", "$name", "$description"];

  for (const field of required) {
    const nodeKey = field as keyof SchemaDocument;
    const node = doc[nodeKey] as NodeWithRange<unknown> | undefined;

    if (!node) {
      diagnostics.push({
        message: `Missing required top-level field: ${field}`,
        range: Range.create(0, 0, 0, 1),
        severity: "error",
        code: "missing-required-field",
      });
    }
  }
}

function validateSchemaType(
  doc: SchemaDocument,
  diagnostics: ValidationDiagnostic[]
): void {
  if (!doc.$type) return;

  const validTypes = ["struct", "enum", "union", "platform_ops"];
  if (!validTypes.includes(doc.$type.value)) {
    diagnostics.push({
      message: `Invalid $type: "${doc.$type.value}". Must be one of: ${validTypes.join(", ")}`,
      range: nodeRange(doc.$type.range),
      severity: "error",
      code: "invalid-schema-type",
    });
  }
}

function validateFields(
  doc: SchemaDocument,
  indexer: SchemaIndexer,
  diagnostics: ValidationDiagnostic[]
): void {
  if (doc.$type?.value === "enum") {
    validateEnumSchema(doc, diagnostics);
    return;
  }

  for (const [fieldName, fieldNode] of doc.fields) {
    validateFieldDefinition(fieldName, fieldNode, indexer, diagnostics);
  }
}

function validateEnumSchema(
  doc: SchemaDocument,
  diagnostics: ValidationDiagnostic[]
): void {
  if (!doc.values) {
    diagnostics.push({
      message: "Enum schema must have 'values' field",
      range: Range.create(0, 0, 0, 1),
      severity: "error",
      code: "enum-missing-values",
    });
    return;
  }

  if (doc.default) {
    const values = doc.values.value;
    const defaultVal = doc.default.value;

    let isValidDefault = false;

    if (Array.isArray(values)) {
      // values is an array: ["VAL1", "VAL2"]
      isValidDefault = values.includes(defaultVal);
    } else if (values && typeof values === "object") {
      // values is an object: { VAL1: {...}, VAL2: {...} }
      isValidDefault = defaultVal in values;
    }

    if (values && !isValidDefault) {
      diagnostics.push({
        message: `Default value "${defaultVal}" is not in values list`,
        range: nodeRange(doc.default.range),
        severity: "error",
        code: "enum-invalid-default",
      });
    }
  }
}

function validateFieldDefinition(
  fieldName: string,
  fieldNode: NodeWithRange<FieldDefinition>,
  indexer: SchemaIndexer,
  diagnostics: ValidationDiagnostic[]
): void {
  const field = fieldNode.value;
  const range = fieldNode.range;

  const hasType = !!field.type;
  const hasInclude = !!field.include;

  if (!hasType && !hasInclude) {
    diagnostics.push({
      message: `Field "${fieldName}" must have either 'type' or 'include'`,
      range: nodeRange(range),
      severity: "error",
      code: "field-missing-type-or-include",
    });
    return;
  }

  if (hasType && hasInclude) {
    diagnostics.push({
      message: `Field "${fieldName}" cannot have both 'type' and 'include'`,
      range: nodeRange(range),
      severity: "error",
      code: "field-type-and-include",
    });
  }

  if (hasType) {
    validateFieldType(fieldName, field, diagnostics);
  }

  if (hasInclude) {
    validateFieldInclude(fieldName, field, indexer, diagnostics);
  }

  if (!field.description) {
    diagnostics.push({
      message: `Field "${fieldName}" is missing a description`,
      range: nodeRange(range),
      severity: "warning",
      code: "field-missing-description",
    });
  }

  validateBooleanFields(fieldName, field, diagnostics);
  validateFieldProperties(fieldName, field, diagnostics);
}

function validateBooleanFields(
  fieldName: string,
  field: FieldDefinition,
  diagnostics: ValidationDiagnostic[]
): void {
  if (field.required && field.required.rawValue !== undefined) {
    const raw = field.required.rawValue;
    if (typeof raw !== "boolean") {
      diagnostics.push({
        message: `Field "${fieldName}": 'required' must be a boolean (true or false), got "${raw}"`,
        range: nodeRange(field.required.range),
        severity: "error",
        code: "required-not-boolean",
      });
    }
  }

  if (field.pointer && field.pointer.rawValue !== undefined) {
    const raw = field.pointer.rawValue;
    if (typeof raw !== "boolean") {
      diagnostics.push({
        message: `Field "${fieldName}": 'pointer' must be a boolean (true or false), got "${raw}"`,
        range: nodeRange(field.pointer.range),
        severity: "error",
        code: "pointer-not-boolean",
      });
    }
  }
}

function validateFieldType(
  fieldName: string,
  field: FieldDefinition,
  diagnostics: ValidationDiagnostic[]
): void {
  if (!field.type) return;

  const typeName = field.type.value;
  const isPrimitive = isPrimitiveType(typeName);
  const isSpecial = isSpecialType(typeName);

  if (!isPrimitive && !isSpecial) {
    diagnostics.push({
      message: `Unknown type "${typeName}" for field "${fieldName}"`,
      range: nodeRange(field.type.range),
      severity: "error",
      code: "unknown-type",
    });
    return;
  }

  if (typeName === "array") {
    if (!field.element) {
      diagnostics.push({
        message: `Array field "${fieldName}" must have 'element' property`,
        range: nodeRange(field.type.range),
        severity: "error",
        code: "array-missing-element",
      });
    }
    if (!field.size) {
      diagnostics.push({
        message: `Array field "${fieldName}" must have 'size' property`,
        range: nodeRange(field.type.range),
        severity: "error",
        code: "array-missing-size",
      });
    }
  }

  if (typeName === "enum" && !field.values) {
    diagnostics.push({
      message: `Enum field "${fieldName}" must have 'values' property`,
      range: nodeRange(field.type.range),
      severity: "error",
      code: "enum-field-missing-values",
    });
  }

  if (typeName === "union") {
    if (!field.selector) {
      diagnostics.push({
        message: `Union field "${fieldName}" must have 'selector' property`,
        range: nodeRange(field.type.range),
        severity: "error",
        code: "union-missing-selector",
      });
    }
    if (!field.members) {
      diagnostics.push({
        message: `Union field "${fieldName}" must have 'members' property`,
        range: nodeRange(field.type.range),
        severity: "error",
        code: "union-missing-members",
      });
    }
  }

  if (typeName === "const_ptr" && !field.target) {
    diagnostics.push({
      message: `const_ptr field "${fieldName}" must have 'target' property`,
      range: nodeRange(field.type.range),
      severity: "error",
      code: "const-ptr-missing-target",
    });
  }

  if ((typeName === "platform_extra" || typeName === "platform_ops") && !field.platforms) {
    diagnostics.push({
      message: `${typeName} field "${fieldName}" must have 'platforms' property`,
      range: nodeRange(field.type.range),
      severity: "error",
      code: "platform-missing-platforms",
    });
  }

  validateNumericConstraints(fieldName, field, diagnostics);
}

function validateNumericConstraints(
  fieldName: string,
  field: FieldDefinition,
  diagnostics: ValidationDiagnostic[]
): void {
  if (!field.type) return;

  const typeInfo = getPrimitiveTypeInfo(field.type.value);
  if (!typeInfo) return;

  if (field.minimum && typeInfo.min !== undefined) {
    if (field.minimum.value < typeInfo.min) {
      diagnostics.push({
        message: `minimum ${field.minimum.value} is below type minimum ${typeInfo.min}`,
        range: nodeRange(field.minimum.range),
        severity: "warning",
        code: "minimum-below-type-min",
      });
    }
  }

  if (field.maximum && typeInfo.max !== undefined) {
    if (field.maximum.value > typeInfo.max) {
      diagnostics.push({
        message: `maximum ${field.maximum.value} exceeds type maximum ${typeInfo.max}`,
        range: nodeRange(field.maximum.range),
        severity: "warning",
        code: "maximum-exceeds-type-max",
      });
    }
  }

  if (field.minimum && field.maximum) {
    if (field.minimum.value > field.maximum.value) {
      diagnostics.push({
        message: `minimum ${field.minimum.value} is greater than maximum ${field.maximum.value}`,
        range: nodeRange(field.minimum.range),
        severity: "error",
        code: "minimum-greater-than-maximum",
      });
    }
  }
}

function validateFieldInclude(
  fieldName: string,
  field: FieldDefinition,
  indexer: SchemaIndexer,
  diagnostics: ValidationDiagnostic[]
): void {
  if (!field.include) return;

  const includePath = field.include.value;
  const resolved = indexer.resolveInclude(includePath);

  if (!resolved) {
    diagnostics.push({
      message: `Cannot resolve include "${includePath}" for field "${fieldName}"`,
      range: nodeRange(field.include.range),
      severity: "error",
      code: "unresolved-include",
    });
  }
}

function validateFieldProperties(
  fieldName: string,
  field: FieldDefinition,
  diagnostics: ValidationDiagnostic[]
): void {
  const hasType = !!field.type;
  const hasInclude = !!field.include;
  const typeName = field.type?.value;

  if (hasInclude) {
    if (field.default) {
      diagnostics.push({
        message: `Field "${fieldName}" with include cannot have 'default'`,
        range: nodeRange(field.default.range),
        severity: "error",
        code: "include-with-default",
      });
    }
    if (field.minimum) {
      diagnostics.push({
        message: `Field "${fieldName}" with include cannot have 'minimum'`,
        range: nodeRange(field.minimum.range),
        severity: "error",
        code: "include-with-minimum",
      });
    }
    if (field.maximum) {
      diagnostics.push({
        message: `Field "${fieldName}" with include cannot have 'maximum'`,
        range: nodeRange(field.maximum.range),
        severity: "error",
        code: "include-with-maximum",
      });
    }
  }

  if (hasType && !isPrimitiveType(typeName || "")) {
    if (field.minimum) {
      diagnostics.push({
        message: `'minimum' is only valid for primitive numeric types`,
        range: nodeRange(field.minimum.range),
        severity: "error",
        code: "minimum-on-non-numeric",
      });
    }
    if (field.maximum) {
      diagnostics.push({
        message: `'maximum' is only valid for primitive numeric types`,
        range: nodeRange(field.maximum.range),
        severity: "error",
        code: "maximum-on-non-numeric",
      });
    }
  }
}

function validateOverride(
  doc: SchemaDocument,
  diagnostics: ValidationDiagnostic[]
): void {
  if (!doc.$override) return;

  const rules = doc.$override.value;
  if (!Array.isArray(rules)) return;

  const fieldNames = new Set(doc.fields.keys());

  for (const rule of rules) {
    if (rule.$mutex) {
      for (const mutexField of rule.$mutex) {
        if (!fieldNames.has(mutexField)) {
          diagnostics.push({
            message: `$mutex references unknown field "${mutexField}"`,
            range: nodeRange(doc.$override.range),
            severity: "error",
            code: "mutex-unknown-field",
          });
        }
      }
    }

    if (rule.$if) {
      // Valid special keywords in $if blocks
      const validKeywords = new Set(["$parent", "$this", "$any"]);
      for (const ifField of Object.keys(rule.$if)) {
        // Skip validation for special keywords
        if (ifField.startsWith("$") && validKeywords.has(ifField)) {
          continue;
        }
        if (!fieldNames.has(ifField)) {
          diagnostics.push({
            message: `$if references unknown field "${ifField}"`,
            range: nodeRange(doc.$override.range),
            severity: "error",
            code: "if-unknown-field",
          });
        }
      }
    }

    if (rule.$switch && rule.$switch.$on) {
      if (!fieldNames.has(rule.$switch.$on)) {
        diagnostics.push({
          message: `$switch.$on references unknown field "${rule.$switch.$on}"`,
          range: nodeRange(doc.$override.range),
          severity: "error",
          code: "switch-unknown-field",
        });
      }
    }
  }
}

function nodeRange(range: { start: { line: number; character: number }; end: { line: number; character: number } }): Range {
  return Range.create(range.start.line, range.start.character, range.end.line, range.end.character);
}
