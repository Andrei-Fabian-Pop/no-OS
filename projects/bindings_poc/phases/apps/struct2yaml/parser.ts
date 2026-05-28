import {
  ParsedField,
  ParsedStruct,
  ParsedUnion,
  ParsedEnum,
  ParsedEnumValue,
  ParsedHeader,
} from "./types";

function extractDoxygenComment(content: string, position: number): string {
  const before = content.substring(0, position);
  const match = before.match(/\/\*\*([^*]|\*(?!\/))*\*\/\s*$/);
  if (!match) return "";

  const comment = match[0];
  const briefMatch = comment.match(/@brief\s+([^\n*]+)/);
  if (briefMatch) {
    return briefMatch[1].trim();
  }

  const cleaned = comment
    .replace(/^\/\*\*\s*/, "")
    .replace(/\s*\*\/$/, "")
    .replace(/^\s*\*\s?/gm, "")
    .trim();

  return cleaned.split("\n")[0].trim();
}

function extractFieldComment(line: string): string {
  const inlineMatch = line.match(/\/\*\*?\s*([^*\/]+)\s*\*\//);
  if (inlineMatch) {
    return inlineMatch[1].trim();
  }

  const slashMatch = line.match(/\/\/\s*(.+)$/);
  if (slashMatch) {
    return slashMatch[1].trim();
  }

  return "";
}

function parseStructFields(body: string): ParsedField[] {
  const fields: ParsedField[] = [];
  const lines = body.split(";").filter((l) => l.trim());

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const description = extractFieldComment(line);
    const cleanLine = trimmed
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .trim();

    if (!cleanLine) continue;

    const arrayMatch = cleanLine.match(
      /^(?:(?:const|volatile|struct|enum|union)\s+)*(\w+(?:\s+\w+)*)\s+\*?\s*(\w+)\s*\[\s*(\d+)\s*\]/
    );
    if (arrayMatch) {
      const [, rawType, name, size] = arrayMatch;
      const typeClean = rawType.replace(/\b(const|volatile)\b/g, "").trim();
      const isEnum = /\benum\s/.test(cleanLine);
      const isUnion = /\bunion\s/.test(cleanLine);
      const baseType = typeClean.replace(/^(struct|enum|union)\s+/, "");
      const isPointer = cleanLine.includes("*");

      fields.push({
        name,
        type: baseType,
        isPointer,
        isArray: true,
        arraySize: parseInt(size, 10),
        isEnum,
        isUnion,
        description,
      });
      continue;
    }

    const fieldMatch = cleanLine.match(
      /^(?:(?:const|volatile|struct|enum|union)\s+)*(\w+)\s*(\*?)\s*(\w+)$/
    );
    if (fieldMatch) {
      let [, rawType, ptrChar, name] = fieldMatch;
      const isPointer = ptrChar === "*";
      const typeClean = rawType.replace(/\b(const|volatile)\b/g, "").trim();
      const isEnum = /\benum\s/.test(cleanLine);
      const isUnion = /\bunion\s/.test(cleanLine);
      const baseType = typeClean;

      fields.push({
        name,
        type: baseType,
        isPointer,
        isArray: false,
        arraySize: null,
        isEnum,
        isUnion,
        description,
      });
      continue;
    }

    const funcPtrMatch = cleanLine.match(/\(\s*\*\s*(\w+)\s*\)/);
    if (funcPtrMatch) {
      console.warn(`Warning: Skipping function pointer field: ${funcPtrMatch[1]}`);
      continue;
    }
  }

  return fields;
}

function parseStructs(content: string): ParsedStruct[] {
  const structs: ParsedStruct[] = [];
  const structRegex = /struct\s+(\w+)\s*\{([^}]+)\}/g;

  let match;
  while ((match = structRegex.exec(content)) !== null) {
    const name = match[1];
    const body = match[2];
    const position = match.index;
    const description = extractDoxygenComment(content, position);
    const fields = parseStructFields(body);

    structs.push({ name, description, fields });
  }

  return structs;
}

function parseEnumValues(body: string): ParsedEnumValue[] {
  const values: ParsedEnumValue[] = [];

  const descriptionMap = new Map<string, string>();
  const commentRegex = /\/\*\*\s*([^*]|\*(?!\/))*\s*\*\/\s*(\w+)/g;
  let commentMatch;
  while ((commentMatch = commentRegex.exec(body)) !== null) {
    const fullMatch = commentMatch[0];
    const valueName = commentMatch[2];
    const commentPart = fullMatch.substring(0, fullMatch.lastIndexOf(valueName));
    const desc = commentPart
      .replace(/^\/\*\*\s*/, "")
      .replace(/\s*\*\/\s*$/, "")
      .replace(/^\s*\*\s?/gm, "")
      .trim();
    descriptionMap.set(valueName, desc);
  }

  const cleanedBody = body
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  const lines = cleanedBody.split(",");

  for (const line of lines) {
    const cleanLine = line.trim();

    if (!cleanLine) continue;

    const withValueMatch = cleanLine.match(/^(\w+)\s*=\s*(.+)$/);
    if (withValueMatch) {
      const valueName = withValueMatch[1];
      values.push({
        name: valueName,
        value: withValueMatch[2].trim(),
        description: descriptionMap.get(valueName) || "",
      });
      continue;
    }

    const simpleMatch = cleanLine.match(/^(\w+)$/);
    if (simpleMatch) {
      const valueName = simpleMatch[1];
      values.push({
        name: valueName,
        value: null,
        description: descriptionMap.get(valueName) || "",
      });
    }
  }

  return values;
}

function parseUnions(content: string): ParsedUnion[] {
  const unions: ParsedUnion[] = [];
  const unionRegex = /union\s+(\w+)\s*\{([^}]+)\}/g;

  let match;
  while ((match = unionRegex.exec(content)) !== null) {
    const name = match[1];
    const body = match[2];
    const position = match.index;
    const description = extractDoxygenComment(content, position);
    const fields = parseStructFields(body);

    unions.push({ name, description, fields });
  }

  return unions;
}

function parseEnums(content: string): ParsedEnum[] {
  const enums: ParsedEnum[] = [];
  const enumRegex = /enum\s+(\w+)\s*\{([^}]+)\}/g;

  let match;
  while ((match = enumRegex.exec(content)) !== null) {
    const name = match[1];
    const body = match[2];
    const position = match.index;
    const description = extractDoxygenComment(content, position);
    const values = parseEnumValues(body);

    enums.push({ name, description, values });
  }

  return enums;
}

export function parseHeader(content: string): ParsedHeader {
  return {
    structs: parseStructs(content),
    unions: parseUnions(content),
    enums: parseEnums(content),
  };
}

export function findStruct(
  parsed: ParsedHeader,
  name: string
): ParsedStruct | null {
  return parsed.structs.find((s) => s.name === name) || null;
}

export function findUnion(
  parsed: ParsedHeader,
  name: string
): ParsedUnion | null {
  return parsed.unions.find((u) => u.name === name) || null;
}

export function findEnum(parsed: ParsedHeader, name: string): ParsedEnum | null {
  return parsed.enums.find((e) => e.name === name) || null;
}
