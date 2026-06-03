import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("noosSchemaLsp");
  if (!config.get<boolean>("enable", true)) {
    return;
  }

  const serverModule = context.asAbsolutePath(
    path.join("..", "..", "dist", "server.js")
  );

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.stdio,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.stdio,
      options: {
        execArgv: ["--nolazy", "--inspect=6009"],
      },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      {
        scheme: "file",
        language: "yaml",
        pattern: "**/schemas_v2/**/*.yaml",
      },
      {
        scheme: "file",
        language: "yaml",
        pattern: "**/schemas_v2/**/*.yml",
      },
    ],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher(
        "**/schemas_v2/**/*.{yaml,yml}"
      ),
    },
  };

  client = new LanguageClient(
    "noosSchemaLsp",
    "no-OS Schema Language Server",
    serverOptions,
    clientOptions
  );

  client.start();

  context.subscriptions.push({
    dispose: () => {
      if (client) {
        client.stop();
      }
    },
  });

  vscode.window.showInformationMessage(
    "no-OS Schema Language Server activated"
  );
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
