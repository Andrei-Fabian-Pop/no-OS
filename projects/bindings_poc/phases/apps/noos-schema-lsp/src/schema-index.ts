import * as fs from "fs";
import * as path from "path";
import * as YAML from "yaml";
import { IndexedSchema, SchemaIndex, SchemaType } from "./types";

export class SchemaIndexer {
  private index: SchemaIndex = {
    byId: new Map(),
    byName: new Map(),
  };
  private schemasRoot: string | null = null;
  private fileWatcher: fs.FSWatcher | null = null;

  getIndex(): SchemaIndex {
    return this.index;
  }

  getSchemasRoot(): string | null {
    return this.schemasRoot;
  }

  async initialize(workspaceRoot: string): Promise<void> {
    const schemasPath = this.findSchemasDirectory(workspaceRoot);
    if (schemasPath) {
      this.schemasRoot = schemasPath;
      await this.indexDirectory(schemasPath);
      this.watchDirectory(schemasPath);
    }
  }

  private findSchemasDirectory(root: string): string | null {
    const candidates = [
      path.join(root, "schemas_v2"),
      path.join(root, "projects", "bindings_poc", "schemas_v2"),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    }

    let current = root;
    while (current !== path.dirname(current)) {
      const schemasDir = path.join(current, "schemas_v2");
      if (fs.existsSync(schemasDir) && fs.statSync(schemasDir).isDirectory()) {
        return schemasDir;
      }
      current = path.dirname(current);
    }

    return null;
  }

  private async indexDirectory(dir: string): Promise<void> {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name !== "meta" && entry.name !== "node_modules") {
          await this.indexDirectory(fullPath);
        }
      } else if (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")) {
        await this.indexFile(fullPath);
      }
    }
  }

  private async indexFile(filePath: string): Promise<void> {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const doc = YAML.parse(content);

      if (!doc || typeof doc !== "object") return;

      const $id = doc.$id as string | undefined;
      const $name = doc.$name as string | undefined;
      const $type = doc.$type as SchemaType | undefined;
      const $description = doc.$description as string | undefined;

      if (!$id || !$name || !$type) return;

      const fields: string[] = [];
      for (const key of Object.keys(doc)) {
        if (!key.startsWith("$") && key !== "values" && key !== "default") {
          fields.push(key);
        }
      }

      const indexed: IndexedSchema = {
        id: $id,
        name: $name,
        type: $type,
        description: $description || "",
        filePath,
        fields,
      };

      this.index.byId.set($id, indexed);
      this.index.byName.set($name, indexed);
    } catch (e) {
      // Ignore parse errors during indexing
    }
  }

  private watchDirectory(dir: string): void {
    try {
      this.fileWatcher = fs.watch(
        dir,
        { recursive: true },
        async (eventType, filename) => {
          if (
            filename &&
            (filename.endsWith(".yaml") || filename.endsWith(".yml"))
          ) {
            const fullPath = path.join(dir, filename);
            if (fs.existsSync(fullPath)) {
              await this.indexFile(fullPath);
            } else {
              this.removeFile(fullPath);
            }
          }
        }
      );
    } catch (e) {
      // Watching may not be supported on all platforms
    }
  }

  private removeFile(filePath: string): void {
    for (const [id, schema] of this.index.byId) {
      if (schema.filePath === filePath) {
        this.index.byId.delete(id);
        this.index.byName.delete(schema.name);
        break;
      }
    }
  }

  resolveInclude(includePath: string): IndexedSchema | null {
    if (!this.schemasRoot) return null;

    const fullPath = path.join(this.schemasRoot, includePath);

    for (const schema of this.index.byId.values()) {
      if (schema.filePath === fullPath) {
        return schema;
      }
    }

    const normalized = includePath.replace(/\.yaml$/, "").replace(/\//g, "_");

    for (const schema of this.index.byId.values()) {
      if (schema.id === includePath || schema.id === normalized) {
        return schema;
      }
    }

    return null;
  }

  getSchemaById(id: string): IndexedSchema | null {
    return this.index.byId.get(id) || null;
  }

  getSchemaByName(name: string): IndexedSchema | null {
    return this.index.byName.get(name) || null;
  }

  getAllSchemaIds(): string[] {
    return Array.from(this.index.byId.keys());
  }

  getAllSchemaNames(): string[] {
    return Array.from(this.index.byName.keys());
  }

  getIncludePaths(): string[] {
    if (!this.schemasRoot) return [];

    const paths: string[] = [];
    for (const schema of this.index.byId.values()) {
      const relativePath = path.relative(this.schemasRoot, schema.filePath);
      paths.push(relativePath);
    }
    return paths;
  }

  dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
  }
}
