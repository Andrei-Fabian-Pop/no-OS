import { Range, Position } from "vscode-languageserver";

export type SchemaType = "struct" | "enum" | "union" | "platform_ops";

export interface SourceRange {
  start: Position;
  end: Position;
}

export interface NodeWithRange<T = unknown> {
  value: T;
  range: SourceRange;
}

export interface SchemaDocument {
  $id?: NodeWithRange<string>;
  $type?: NodeWithRange<SchemaType>;
  $name?: NodeWithRange<string>;
  $description?: NodeWithRange<string>;
  $sources?: NodeWithRange<SourcesDefinition>;
  $override?: NodeWithRange<OverrideRule[]>;
  values?: NodeWithRange<Record<string, EnumValueDef>>;
  default?: NodeWithRange<string>;
  fields: Map<string, NodeWithRange<FieldDefinition>>;
  raw: Record<string, unknown>;
  documentRange: SourceRange;
}

export interface SourcesDefinition {
  headers?: string[];
  sources?: string[];
  api?: { headers?: string[]; sources?: string[] };
  platform?: { headers?: string[]; sources?: string[] };
  sdk?: { headers?: string[]; sources?: string[] };
}

export interface NodeWithRangeAndRaw<T = unknown> extends NodeWithRange<T> {
  rawValue?: unknown;
}

export interface FieldDefinition {
  type?: NodeWithRange<string>;
  include?: NodeWithRange<string>;
  pointer?: NodeWithRangeAndRaw<boolean>;
  required?: NodeWithRangeAndRaw<boolean>;
  description?: NodeWithRange<string>;
  default?: NodeWithRange<unknown>;
  minimum?: NodeWithRange<number>;
  maximum?: NodeWithRange<number>;
  values?: NodeWithRange<string[]>;
  element?: NodeWithRange<ElementDefinition>;
  size?: NodeWithRange<number>;
  platforms?: NodeWithRange<PlatformInclude[]>;
  target?: NodeWithRange<string>;
  selector?: NodeWithRange<string>;
  members?: NodeWithRange<Record<string, unknown>>;
}

export interface ElementDefinition {
  type?: string;
  include?: string;
}

export interface PlatformInclude {
  include: string;
}

export interface EnumValueDef {
  description?: string;
}

export interface OverrideRule {
  $mutex?: string[];
  $if?: Record<string, unknown>;
  $then?: Record<string, unknown>;
  $switch?: SwitchRule;
  $parent?: OverrideRule[];
}

export interface SwitchRule {
  $on: string;
  $cases: Record<string, unknown>;
}

export interface PrimitiveType {
  name: string;
  description: string;
  cType: string;
  sizeBits: number | "platform_dependent";
  signed: boolean;
  min?: number;
  max?: number;
  values?: boolean[];
}

export interface MetaSchema {
  primitiveTypes: Map<string, PrimitiveType>;
  topLevelFields: Set<string>;
  requiredTopLevelFields: Set<string>;
  validSchemaTypes: Set<string>;
  propertyFields: Set<string>;
  specialTypes: Set<string>;
}

export interface SchemaIndex {
  byId: Map<string, IndexedSchema>;
  byName: Map<string, IndexedSchema>;
}

export interface IndexedSchema {
  id: string;
  name: string;
  type: SchemaType;
  description: string;
  filePath: string;
  fields: string[];
}

export interface ValidationDiagnostic {
  message: string;
  range: Range;
  severity: "error" | "warning" | "info";
  code?: string;
}

export interface CompletionContext {
  position: Position;
  line: string;
  isTopLevel: boolean;
  isFieldProperty: boolean;
  isPropertyValue: boolean;
  isInArray: boolean;
  arrayType?: "platforms" | "values" | "members";
  isInOverride: boolean;
  overrideContext?: "root" | "mutex" | "if" | "then" | "switch" | "cases" | "parent" | "this" | "value_array";
  currentField?: string;
  currentProperty?: string;
  schemaType?: SchemaType;
  existingProperties?: Set<string>;
  fieldNames?: string[];
  fieldHasType?: boolean;
  fieldHasInclude?: boolean;
  fieldType?: string;
  includeValue?: string;
}
