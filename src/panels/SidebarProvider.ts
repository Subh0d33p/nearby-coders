import * as vscode from "vscode";
import { AuthService } from "../auth";
import { geocodeCity } from "../api/location";
import { getNearbyCodersConfig } from "../config";
import { NearbyCodersRepository } from "../supabaseClient";
import { SessionState, WebviewIncomingMessage, WebviewOutgoingMessage } from "../types";

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "nearbyCoders.sidebar";

  private view?: vscode.WebviewView;
  private readonly authService = new AuthService();

  private state: SessionState = {
    isAuthenticated: false,
    profile: null,
    nearbyCoders: [],
    authMode: "signed-out"
  };

  private supabaseAccessToken?: string;
  private supabaseUserId?: string;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly extensionUri: vscode.Uri
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView
  ): void {
    this.view = webviewView;
    const { webview } = webviewView;

    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "webview"),
        vscode.Uri.joinPath(this.extensionUri, "dist", "webview")
      ]
    };

    webview.html = this.getHtml(webview);

    webview.onDidReceiveMessage((message: WebviewIncomingMessage) => {
      void this.handleMessage(message);
    });
  }

  // ---------------- AUTH ----------------

  async login(): Promise<void> {
    await this.setLoading(true);
    try {
      const githubIdentity = await this.authService.loginWithGithub({
        forceNewSession: this.state.isAuthenticated
      });

      const supabaseSession =
        await this.authService.exchangeGithubForSupabase(githubIdentity);

      this.supabaseAccessToken = supabaseSession.accessToken;
      this.supabaseUserId = supabaseSession.userId;

      const repository = this.getRepository();
      const profile = await repository.getMyProfile(this.supabaseUserId);

      this.state = {
        isAuthenticated: true,
        profile,
        nearbyCoders: [],
        authMode: "supabase-edge-exchange"
      };

      await this.pushState();
      this.toast("Signed in with GitHub.", "success");

    } catch (error) {
      this.toast(this.formatError(error), "error");
    } finally {
      await this.setLoading(false);
    }
  }

  async logout(): Promise<void> {
    this.supabaseAccessToken = undefined;
    this.supabaseUserId = undefined;

    this.state = {
      isAuthenticated: false,
      profile: null,
      nearbyCoders: [],
      authMode: "signed-out"
    };

    await this.authService.logoutFromGithub();
    await this.pushState();
    this.toast("Signed out.", "info");
  }

  // ---------------- NEARBY ----------------

  async refreshNearby(
    radiusMeters = getNearbyCodersConfig().defaultRadiusMeters
  ): Promise<void> {

    if (!this.supabaseUserId) {
      this.toast("Login first.", "error");
      return;
    }

    await this.setLoading(true);

    try {
      const repository = this.getRepository();

      const profile = await repository.getMyProfile(
        this.supabaseUserId
      );

      if (!profile?.city || !profile.country) {
        throw new Error("Complete your profile first.");
      }

      const location = await geocodeCity(
        `${profile.city}, ${profile.country}`
      );

      // update last_seen
      await repository.upsertProfile(
        this.supabaseUserId,
        {
          username: profile.username ?? "",
          avatar_url: profile.avatar_url ?? "",
          github_id: profile.github_id ?? "",
          city: profile.city ?? "",
          country: profile.country ?? "",
          skills: profile.skills ?? [],
          online_status: profile.online_status ?? false,
          last_seen: new Date().toISOString(),
          coordinates: {
            latitude: location.latitude,
            longitude: location.longitude
          }
        }
      );

      const nearbyCoders =
        await repository.matchCoders(
          location.latitude,
          location.longitude,
          radiusMeters
        );

      this.state = {
        ...this.state,
        profile,
        nearbyCoders
      };

      await this.pushState();

    } catch (error) {
      this.toast(this.formatError(error), "error");
    } finally {
      await this.setLoading(false);
    }
  }

  // ---------------- MESSAGE HANDLER ----------------

  private async handleMessage(
    message: WebviewIncomingMessage
  ): Promise<void> {

    switch (message.type) {

      case "ready":
        await this.pushState();
        break;

      case "login":
        await this.login();
        break;

      case "logout":
        await this.logout();
        break;

      case "saveProfile":
        await this.saveProfile(
          message.payload.cityQuery,
          message.payload.skillsInput,
          message.payload.onlineStatus
        );
        break;

      case "refreshNearby":
        await this.refreshNearby(
          message.payload?.radiusMeters ??
          getNearbyCodersConfig().defaultRadiusMeters
        );
        break;

      // 🔥 AUTO LOCATION
      case "autoLocation": {

        if (!this.supabaseUserId) {
          this.toast("Login first.", "error");
          return;
        }

        await this.setLoading(true);

        try {
          const res = await fetch("https://ipinfo.io/json");
          const data = await res.json();

          if (!data.loc) {
            throw new Error("Could not detect location");
          }

          const [lat, lng] =
            data.loc.split(",").map(Number);

          const repository = this.getRepository();

          const profile = await repository.getMyProfile(
            this.supabaseUserId
          );

          await repository.upsertProfile(
            this.supabaseUserId,
            {
              username: profile?.username ?? "",
              avatar_url: profile?.avatar_url ?? "",
              github_id: profile?.github_id ?? "",
              city: data.city,
              country: data.country,
              skills: profile?.skills ?? [],
              online_status: profile?.online_status ?? false,
              last_seen: new Date().toISOString(),
              coordinates: {
                latitude: lat,
                longitude: lng
              }
            }
          );

          // ✅ ONLY refresh (pushState already inside it)
          await this.refreshNearby();

          this.toast(
            "Location detected and nearby coders updated",
            "success"
          );

        } catch (error) {
          console.error("AUTO LOCATION ERROR:", error);
          this.toast(this.formatError(error), "error");
        } finally {
          await this.setLoading(false);
        }

        break;
      }
    }
  }

  // ---------------- SAVE PROFILE ----------------

  private async saveProfile(
    cityQuery: string,
    skillsInput: string,
    onlineStatus: boolean
  ): Promise<void> {

    if (!this.supabaseUserId) {
      this.toast("Login first.", "error");
      return;
    }

    await this.setLoading(true);

    try {
      const githubIdentity =
        await this.authService.loginWithGithub();

      const location = await geocodeCity(cityQuery);

      const repository = this.getRepository();

      const profile = await repository.upsertProfile(
        this.supabaseUserId,
        {
          username: githubIdentity.username,
          avatar_url: githubIdentity.avatarUrl,
          github_id: githubIdentity.githubUserId,
          city: location.city,
          country: location.country,
          skills: normalizeSkills(skillsInput),
          online_status: onlineStatus,
          last_seen: new Date().toISOString(),
          coordinates: {
            latitude: location.latitude,
            longitude: location.longitude
          }
        }
      );

      this.state = {
        ...this.state,
        isAuthenticated: true,
        profile
      };

     
// await this.pushState();

// ✅ auto refresh nearby
await this.refreshNearby();

this.toast(
  `Profile saved for ${location.displayName}`,
  "success"
);

    } catch (error) {
      this.toast(this.formatError(error), "error");
    } finally {
      await this.setLoading(false);
    }
  }

  // ---------------- UTIL ----------------

  private getRepository(): NearbyCodersRepository {
    return new NearbyCodersRepository(this.supabaseAccessToken);
  }

  private async pushState(): Promise<void> {
    this.postMessage({
      type: "state",
      payload: this.state
    });
  }

  private async setLoading(value: boolean): Promise<void> {
    this.postMessage({
      type: "loading",
      payload: { value }
    });
  }

  private postMessage(message: WebviewOutgoingMessage): void {
    this.view?.webview.postMessage(message);
  }

  private toast(
    message: string,
    level: "info" | "error" | "success"
  ): void {

    this.postMessage({
      type: "toast",
      payload: { message, level }
    });

    if (level === "error") {
      vscode.window.showErrorMessage(message);
    } else if (level === "success") {
      vscode.window.showInformationMessage(message);
    }
  }

  private formatError(error: unknown): string {
    return error instanceof Error
      ? error.message
      : "Unexpected error";
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "main.js")
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "webview", "style.css")
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Security-Policy"
content="
default-src 'none';
img-src ${webview.cspSource} https: data:;
style-src ${webview.cspSource} 'unsafe-inline';
script-src 'nonce-${nonce}';
connect-src https:;
"/>
<link href="${styleUri}" rel="stylesheet"/>
</head>
<body>
<div id="app"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function normalizeSkills(input: string): string[] {
  return input.split(",").map(s => s.trim()).filter(Boolean);
}

function getNonce(length = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}