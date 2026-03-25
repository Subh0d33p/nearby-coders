type SessionState = {
  isAuthenticated: boolean;
  authMode: "github-vscode" | "supabase-edge-exchange" | "signed-out";
  profile: {
    username: string | null;
    avatar_url: string | null;
    city: string | null;
    country: string | null;
    skills: string[] | null;
    online_status: boolean | null;
    account_id: number;
  } | null;
  nearbyCoders: Array<{
    account_id: number;
    username: string | null;
    avatar_url: string | null;
    city: string | null;
    country: string | null;
    skills: string[] | null;
    last_seen: string | null;
    distance_meters: number;
  }>;
};

type IncomingMessage =
  | { type: "state"; payload: SessionState }
  | { type: "loading"; payload: { value: boolean } }
  | { type: "toast"; payload: { message: string; level: "info" | "error" | "success" } };

type OutgoingMessage =
  | { type: "ready" }
  | { type: "login" }
  | { type: "logout" }
  | { type: "saveProfile"; payload: { cityQuery: string; skillsInput: string; onlineStatus: boolean } }
  | { type: "refreshNearby"; payload?: { radiusMeters?: number } };

declare function acquireVsCodeApi(): {
  postMessage(message: OutgoingMessage): void;
};

const vscode = acquireVsCodeApi();
const app = document.querySelector<HTMLDivElement>("#app");

let loading = false;
let state: SessionState = {
  isAuthenticated: false,
  authMode: "signed-out",
  profile: null,
  nearbyCoders: []
};

if (!app) {
  throw new Error("App container not found.");
}

window.addEventListener("message", (event: MessageEvent<IncomingMessage>) => {
  const message = event.data;

  if (message.type === "state") {
    state = message.payload;
    render();
  }

  if (message.type === "loading") {
    loading = message.payload.value;
    render();
  }

  if (message.type === "toast") {
    const toast = document.querySelector<HTMLElement>("[data-toast]");
    if (toast) {
      toast.textContent = message.payload.message;
      toast.dataset.level = message.payload.level;
    }
  }
});

render();
vscode.postMessage({ type: "ready" });

function render(): void {
  app!.innerHTML = `
    <section class="shell">
      <header class="hero">
        <p class="eyebrow">Nearby Coders</p>
        <h1>Find developers close to you.</h1>
        <p class="muted">GitHub identity, geocoded cities, and PostGIS-powered distance search.</p>
      </header>

      <div class="actions">
        <button class="primary" data-action="login" ${loading ? "disabled" : ""}>
          ${state.isAuthenticated ? "Refresh GitHub Session" : "Login with GitHub"}
        </button>
        <button class="secondary" data-action="refresh" ${loading || !state.isAuthenticated ? "disabled" : ""}>
          Refresh Nearby
        </button>
        <button class="ghost" data-action="logout" ${loading || !state.isAuthenticated ? "disabled" : ""}>
          Logout
        </button>
      </div>

      <section class="card">
        <div class="card-title-row">
  <h2>
    Your Profile
    ${
    state.profile?.account_id
      ? `<span class="user-id">#${state.profile.account_id}</span>`
      : ""
  }
  </h2>

  <span class="badge">
    ${state.isAuthenticated ? state.authMode : "signed-out"}
  </span>
</div>
        <label>
          <span>City</span>
          <input id="cityQuery" type="text" placeholder="Bengaluru, India" value="${escapeHtml(
    formatLocation(state.profile)
  )}" ${loading || !state.isAuthenticated ? "disabled" : ""} />
        </label>
        <label>
          <span>Skills</span>
          <input id="skillsInput" type="text" placeholder="TypeScript, Rust, Postgres" value="${escapeHtml(
    state.profile?.skills?.join(", ") ?? ""
  )}" ${loading || !state.isAuthenticated ? "disabled" : ""} />
        </label>
        <label class="checkbox">
          <input id="onlineStatus" type="checkbox" ${state.profile?.online_status ? "checked" : ""} ${loading || !state.isAuthenticated ? "disabled" : ""
    } />
          <span>Show me as online</span>
        </label>
        <button class="primary full" data-action="save" ${loading || !state.isAuthenticated ? "disabled" : ""}>
          Save Profile
        </button>
      </section>

      <section class="card">
        <div class="card-title-row">
          <h2>Nearby Coders</h2>
          <span class="badge">${state.nearbyCoders.length}</span>
        </div>
        <div class="list">
          ${state.nearbyCoders.length
      ? state.nearbyCoders
        .map(
          (coder) => `
                  <article class="coder">
                    <div class="coder-row">
                      <img
  class="avatar"
  src="${escapeHtml(coder.avatar_url || 'https://avatars.githubusercontent.com/u/0?v=4')}"
/>
                      <div>
                       <strong>
  #${coder.account_id}
  ${escapeHtml(coder.username ?? "Anonymous coder")}
  ${
    isOnline(coder.last_seen)
      ? '<span class="online"> ● online</span>'
      : `<span class="offline"> ● ${formatLastSeen(coder.last_seen)}</span>`
  }
</strong>
                        <p class="muted">${escapeHtml([coder.city, coder.country].filter(Boolean).join(", "))}</p>
                      </div>
                    </div>
                    <p class="muted">${escapeHtml((coder.skills ?? []).join(", "))}</p>
                    <p class="distance">${formatDistance(coder.distance_meters)}</p>
                  </article>
                `
        )
        .join("")
      : `<p class="empty">No nearby coders yet. Save your location and refresh.</p>`
    }
        </div>
      </section>

      <footer class="status-row">
        <span data-toast class="muted">${loading ? "Working..." : "Ready"}</span>
      </footer>
    </section>
  `;

  bindEvents();
}

function bindEvents(): void {
  document.querySelector<HTMLElement>('[data-action="login"]')?.addEventListener("click", () => {
    vscode.postMessage({ type: "login" });
  });

  document.querySelector<HTMLElement>('[data-action="logout"]')?.addEventListener("click", () => {
    vscode.postMessage({ type: "logout" });
  });

  document.querySelector<HTMLElement>('[data-action="refresh"]')?.addEventListener("click", () => {
    vscode.postMessage({ type: "refreshNearby" });
  });

  document.querySelector<HTMLElement>('[data-action="save"]')?.addEventListener("click", () => {
    const cityQuery = (document.querySelector<HTMLInputElement>("#cityQuery")?.value ?? "").trim();
    const skillsInput = (document.querySelector<HTMLInputElement>("#skillsInput")?.value ?? "").trim();
    const onlineStatus = document.querySelector<HTMLInputElement>("#onlineStatus")?.checked ?? false;

    vscode.postMessage({
      type: "saveProfile",
      payload: { cityQuery, skillsInput, onlineStatus }
    });
  });
}

function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m away`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km away`;
}

function formatLocation(
  profile: SessionState["profile"]
): string {
  return [profile?.city, profile?.country].filter(Boolean).join(", ");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isOnline(lastSeen: string | null): boolean {

  if (!lastSeen) return false;

  const last = new Date(lastSeen).getTime();
  const now = Date.now();

  const diff = now - last;

  return diff < 2 * 60 * 1000; // 2 minutes
}

function formatLastSeen(lastSeen: string | null): string {

  if (!lastSeen) return "offline";

  const last = new Date(lastSeen).getTime();
  const now = Date.now();

  const diff = now - last;

  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const days = Math.floor(hr / 24);

  if (sec < 30) return "just now";
  if (min < 60) return `${min} min ago`;
  if (hr < 24) return `${hr} h ago`;

  return `${days} d ago`;
}