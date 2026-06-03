import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  CompletionItem,
  Hover,
  Location,
  DocumentSymbol,
  SymbolKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { parseYamlDocument, getCompletionContext } from "./parser";
import { validateSchema } from "./validator";
import { getCompletions } from "./completions";
import { getHover } from "./hover";
import { getDefinition } from "./definitions";
import { SchemaIndexer } from "./schema-index";
import { SchemaDocument, ValidationDiagnostic } from "./types";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const indexer = new SchemaIndexer();

const documentCache = new Map<string, SchemaDocument | null>();

connection.onInitialize(async (params: InitializeParams): Promise<InitializeResult> => {
  const workspaceRoot = params.rootUri
    ? params.rootUri.replace("file://", "")
    : params.rootPath || process.cwd();

  await indexer.initialize(workspaceRoot);

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: ["$", ":", " ", "/", '"'],
        resolveProvider: false,
      },
      hoverProvider: true,
      definitionProvider: true,
      documentSymbolProvider: true,
    },
  };
});

connection.onInitialized(() => {
  connection.console.log("no-OS Schema LSP server initialized");
});

documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

documents.onDidClose((event) => {
  documentCache.delete(event.document.uri);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

async function validateDocument(textDocument: TextDocument): Promise<void> {
  const uri = textDocument.uri;

  if (!isSchemaFile(uri)) {
    return;
  }

  const text = textDocument.getText();
  const parseResult = parseYamlDocument(text);

  documentCache.set(uri, parseResult.document);

  const diagnostics: Diagnostic[] = [];

  for (const error of parseResult.errors) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: error.range,
      message: error.message,
      source: "noos-schema",
    });
  }

  if (parseResult.document) {
    const validationDiags = validateSchema(parseResult.document, indexer);
    for (const diag of validationDiags) {
      diagnostics.push({
        severity: mapSeverity(diag.severity),
        range: diag.range,
        message: diag.message,
        source: "noos-schema",
        code: diag.code,
      });
    }
  }

  connection.sendDiagnostics({ uri, diagnostics });
}

function mapSeverity(severity: ValidationDiagnostic["severity"]): DiagnosticSeverity {
  switch (severity) {
    case "error":
      return DiagnosticSeverity.Error;
    case "warning":
      return DiagnosticSeverity.Warning;
    case "info":
      return DiagnosticSeverity.Information;
    default:
      return DiagnosticSeverity.Error;
  }
}

function isSchemaFile(uri: string): boolean {
  const path = uri.replace("file://", "");

  if (path.includes("schemas_v2")) {
    return path.endsWith(".yaml") || path.endsWith(".yml");
  }

  return false;
}

connection.onCompletion((params): CompletionItem[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  if (!isSchemaFile(params.textDocument.uri)) {
    return [];
  }

  const text = document.getText();
  const context = getCompletionContext(text, params.position);

  return getCompletions(context, indexer);
});

connection.onHover((params): Hover | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  if (!isSchemaFile(params.textDocument.uri)) {
    return null;
  }

  const text = document.getText();
  const doc = documentCache.get(params.textDocument.uri) || null;

  return getHover(text, params.position, doc, indexer);
});

connection.onDefinition((params): Location | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  if (!isSchemaFile(params.textDocument.uri)) {
    return null;
  }

  const text = document.getText();
  const doc = documentCache.get(params.textDocument.uri) || null;

  return getDefinition(text, params.position, doc, indexer);
});

connection.onDocumentSymbol((params): DocumentSymbol[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  if (!isSchemaFile(params.textDocument.uri)) {
    return [];
  }

  const doc = documentCache.get(params.textDocument.uri);
  if (!doc) return [];

  const symbols: DocumentSymbol[] = [];

  if (doc.$id) {
    symbols.push({
      name: `$id: ${doc.$id.value}`,
      kind: SymbolKind.Key,
      range: {
        start: doc.$id.range.start,
        end: doc.$id.range.end,
      },
      selectionRange: {
        start: doc.$id.range.start,
        end: doc.$id.range.end,
      },
    });
  }

  if (doc.$type) {
    symbols.push({
      name: `$type: ${doc.$type.value}`,
      kind: SymbolKind.Enum,
      range: {
        start: doc.$type.range.start,
        end: doc.$type.range.end,
      },
      selectionRange: {
        start: doc.$type.range.start,
        end: doc.$type.range.end,
      },
    });
  }

  if (doc.$name) {
    symbols.push({
      name: `$name: ${doc.$name.value}`,
      kind: SymbolKind.Class,
      range: {
        start: doc.$name.range.start,
        end: doc.$name.range.end,
      },
      selectionRange: {
        start: doc.$name.range.start,
        end: doc.$name.range.end,
      },
    });
  }

  for (const [name, fieldNode] of doc.fields) {
    const field = fieldNode.value;
    let detail = "";

    if (field.type?.value) {
      detail = field.type.value;
    } else if (field.include?.value) {
      detail = `→ ${field.include.value}`;
    }

    symbols.push({
      name,
      detail,
      kind: SymbolKind.Field,
      range: {
        start: fieldNode.range.start,
        end: fieldNode.range.end,
      },
      selectionRange: {
        start: fieldNode.range.start,
        end: fieldNode.range.end,
      },
    });
  }

  return symbols;
});

documents.listen(connection);
connection.listen();
