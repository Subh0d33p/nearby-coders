import * as vscode from "vscode";
import { SidebarProvider } from "./panels/SidebarProvider";

export function activate(context: vscode.ExtensionContext): void {
  const sidebarProvider = new SidebarProvider(context, context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("nearbyCoders.sidebar", sidebarProvider, {
      webviewOptions: {
        retainContextWhenHidden: true
      }

    }),
    vscode.commands.registerCommand("nearbyCoders.refresh", async () => {
      await sidebarProvider.refreshNearby();
    }),
    vscode.commands.registerCommand("nearbyCoders.login", async () => {
      await sidebarProvider.login();
    }),
    vscode.commands.registerCommand("nearbyCoders.logout", async () => {
      await sidebarProvider.logout();
    })
  );
}

export function deactivate(): void {}
