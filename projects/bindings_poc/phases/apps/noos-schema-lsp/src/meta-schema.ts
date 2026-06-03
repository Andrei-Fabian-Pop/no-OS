import * as fs from "fs";
import * as path from "path";
import * as YAML from "yaml";
import { MetaSchema, PrimitiveType } from "./types";

const PRIMITIVE_TYPES: PrimitiveType[] = [
  { name: "uint8_t", description: "Unsigned 8-bit integer", cType: "uint8_t", sizeBits: 8, signed: false, min: 0, max: 255 },
  { name: "uint16_t", description: "Unsigned 16-bit integer", cType: "uint16_t", sizeBits: 16, signed: false, min: 0, max: 65535 },
  { name: "uint32_t", description: "Unsigned 32-bit integer", cType: "uint32_t", sizeBits: 32, signed: false, min: 0, max: 4294967295 },
  { name: "uint64_t", description: "Unsigned 64-bit integer", cType: "uint64_t", sizeBits: 64, signed: false, min: 0, max: Number.MAX_SAFE_INTEGER },
  { name: "int8_t", description: "Signed 8-bit integer", cType: "int8_t", sizeBits: 8, signed: true, min: -128, max: 127 },
  { name: "int16_t", description: "Signed 16-bit integer", cType: "int16_t", sizeBits: 16, signed: true, min: -32768, max: 32767 },
  { name: "int32_t", description: "Signed 32-bit integer", cType: "int32_t", sizeBits: 32, signed: true, min: -2147483648, max: 2147483647 },
  { name: "int64_t", description: "Signed 64-bit integer", cType: "int64_t", sizeBits: 64, signed: true, min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER },
  { name: "bool", description: "Boolean value", cType: "bool", sizeBits: 8, signed: false, values: [true, false] },
  { name: "size_t", description: "Size type (platform-dependent)", cType: "size_t", sizeBits: "platform_dependent", signed: false, min: 0 },
];

const TOP_LEVEL_FIELDS = new Set([
  "$id",
  "$type",
  "$name",
  "$description",
  "$sources",
  "$override",
  "values",
  "default",
]);

const REQUIRED_TOP_LEVEL_FIELDS = new Set([
  "$id",
  "$type",
  "$name",
  "$description",
]);

const VALID_SCHEMA_TYPES = new Set([
  "struct",
  "enum",
  "union",
  "platform_ops",
]);

const PROPERTY_FIELDS = new Set([
  "type",
  "include",
  "pointer",
  "required",
  "description",
  "default",
  "minimum",
  "maximum",
  "values",
  "element",
  "size",
  "platforms",
  "target",
  "selector",
  "members",
]);

const SPECIAL_TYPES = new Set([
  "enum",
  "union",
  "const_ptr",
  "platform_extra",
  "platform_ops",
  "array",
]);

export function loadMetaSchema(): MetaSchema {
  const primitiveTypesMap = new Map<string, PrimitiveType>();
  for (const pt of PRIMITIVE_TYPES) {
    primitiveTypesMap.set(pt.name, pt);
  }

  return {
    primitiveTypes: primitiveTypesMap,
    topLevelFields: TOP_LEVEL_FIELDS,
    requiredTopLevelFields: REQUIRED_TOP_LEVEL_FIELDS,
    validSchemaTypes: VALID_SCHEMA_TYPES,
    propertyFields: PROPERTY_FIELDS,
    specialTypes: SPECIAL_TYPES,
  };
}

export function getPrimitiveTypeNames(): string[] {
  return PRIMITIVE_TYPES.map((pt) => pt.name);
}

export function getSpecialTypeNames(): string[] {
  return Array.from(SPECIAL_TYPES);
}

export function getAllTypeNames(): string[] {
  return [...getPrimitiveTypeNames(), ...getSpecialTypeNames()];
}

export function isPrimitiveType(typeName: string): boolean {
  return PRIMITIVE_TYPES.some((pt) => pt.name === typeName);
}

export function isSpecialType(typeName: string): boolean {
  return SPECIAL_TYPES.has(typeName);
}

export function getPrimitiveTypeInfo(typeName: string): PrimitiveType | undefined {
  return PRIMITIVE_TYPES.find((pt) => pt.name === typeName);
}

export function getPropertyFieldsForType(
  hasType: boolean,
  hasInclude: boolean,
  typeName?: string
): string[] {
  const fields: string[] = ["description", "required"];

  if (!hasType && !hasInclude) {
    fields.push("type", "include");
  }

  if (hasInclude) {
    fields.push("pointer");
  }

  if (hasType) {
    if (typeName && isPrimitiveType(typeName)) {
      fields.push("default");
      const typeInfo = getPrimitiveTypeInfo(typeName);
      if (typeInfo && typeof typeInfo.min === "number") {
        fields.push("minimum", "maximum");
      }
    } else if (typeName === "array") {
      fields.push("size", "element");
    } else if (typeName === "enum") {
      fields.push("values", "default");
    } else if (typeName === "union") {
      fields.push("selector", "members");
    } else if (typeName === "platform_extra" || typeName === "platform_ops") {
      fields.push("platforms");
      if (typeName === "platform_ops") {
        fields.push("target");
      }
    } else if (typeName === "const_ptr") {
      fields.push("target");
    }
  }

  return fields;
}

export function getTopLevelFieldsForSchemaType(schemaType: string): string[] {
  const common = ["$id", "$type", "$name", "$description", "$sources"];

  switch (schemaType) {
    case "struct":
    case "union":
      return [...common, "$override"];
    case "enum":
      return [...common, "values", "default"];
    case "platform_ops":
      return [...common, "symbol"];
    default:
      return common;
  }
}
