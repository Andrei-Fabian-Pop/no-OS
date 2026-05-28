export interface ParsedField {
  name: string;
  type: string;
  isPointer: boolean;
  isArray: boolean;
  arraySize: number | null;
  isEnum: boolean;
  isUnion: boolean;
  description: string;
}

export interface ParsedStruct {
  name: string;
  description: string;
  fields: ParsedField[];
}

export interface ParsedUnion {
  name: string;
  description: string;
  fields: ParsedField[];
}

export interface ParsedEnumValue {
  name: string;
  value: string | null;
  description: string;
}

export interface ParsedEnum {
  name: string;
  description: string;
  values: ParsedEnumValue[];
}

export interface ParsedHeader {
  structs: ParsedStruct[];
  unions: ParsedUnion[];
  enums: ParsedEnum[];
}

export interface SchemaIndex {
  [typeName: string]: string;
}

export interface CliArgs {
  file: string;
  struct: string | null;
  union: string | null;
  enum: string | null;
  schemas: string;
  schemaDir: string | null;
  output: string | null;
  noosRoot: string;
}

export const PRIMITIVE_TYPES = new Set([
  "bool",
  "uint8_t",
  "int8_t",
  "uint16_t",
  "int16_t",
  "uint32_t",
  "int32_t",
  "uint64_t",
  "int64_t",
  "float",
  "double",
  "size_t",
  "char",
  "void",
]);
