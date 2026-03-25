import * as vscode from "vscode";
import { createHash } from "node:crypto";
import { getNearbyCodersConfig } from "./config";
import { GithubIdentity } from "./types";

const GITHUB_PROVIDER_ID = "github";
const GITHUB_SCOPES = ["read:user", "user:email"];

interface GithubApiUser {
  id: number;
  login: string;
  avatar_url: string;
  name?: string | null;
}

export class AuthService {
  public async loginWithGithub(options?: { forceNewSession?: boolean; clearSessionPreference?: boolean }): Promise<GithubIdentity> {
    const session = await vscode.authentication.getSession(GITHUB_PROVIDER_ID, GITHUB_SCOPES, {
      createIfNone: true,
      forceNewSession: options?.forceNewSession,
      clearSessionPreference: options?.clearSessionPreference
    });

    const githubUser = await this.fetchGithubUser(session.accessToken);

    return {
      accessToken: session.accessToken,
      accountLabel: session.account.label,
      githubUserId: String(githubUser.id),
      username: githubUser.login,
      avatarUrl: githubUser.avatar_url
    };
  }

  public async logoutFromGithub(): Promise<void> {
    await vscode.authentication.getSession(GITHUB_PROVIDER_ID, GITHUB_SCOPES, {
      silent: true,
      clearSessionPreference: true
    });
  }

  public async exchangeGithubForSupabase(identity: GithubIdentity): Promise<{
    accessToken: string;
    refreshToken?: string;
    userId: string;
  }> {
    const { supabaseExchangeUrl } = getNearbyCodersConfig();

    if (!supabaseExchangeUrl) {
      throw new Error(
        "Missing nearbyCoders.supabaseExchangeUrl. Point it to a secure Edge Function that verifies the GitHub token and mints a Supabase session."
      );
    }

    const response = await fetch(supabaseExchangeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${identity.accessToken}`
      },
      body: JSON.stringify({
        github_user_id: identity.githubUserId,
        username: identity.username,
        avatar_url: identity.avatarUrl,
        account_label: identity.accountLabel,
        identity_hash: createHash("sha256").update(identity.githubUserId).digest("hex")
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Supabase session exchange failed: ${response.status} ${body}`);
    }

    return (await response.json()) as { accessToken: string; refreshToken?: string; userId: string };
  }

  private async fetchGithubUser(accessToken: string): Promise<GithubApiUser> {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "nearby-coders-vscode-extension"
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub profile fetch failed with status ${response.status}`);
    }

    return (await response.json()) as GithubApiUser;
  }
}
