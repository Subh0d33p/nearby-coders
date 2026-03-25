import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const migrationSql = fs.readFileSync(path.join(root, "supabase/migrations/001_nearby_coders.sql"), "utf8");
const authTs = fs.readFileSync(path.join(root, "src/auth.ts"), "utf8");
const configTs = fs.readFileSync(path.join(root, "src/config.ts"), "utf8");
const sidebarTs = fs.readFileSync(path.join(root, "src/panels/SidebarProvider.ts"), "utf8");
const readme = fs.readFileSync(path.join(root, "readme.md"), "utf8");

const requiredFiles = [
  "src/extension.ts",
  "src/auth.ts",
  "src/supabaseClient.ts",
  "src/panels/SidebarProvider.ts",
  "src/api/location.ts",
  "webview/index.html",
  "webview/main.ts",
  "webview/style.css",
  "supabase/migrations/001_nearby_coders.sql"
];

const checks = [
  ...requiredFiles.map((file) => ({
    label: `File exists: ${file}`,
    pass: fs.existsSync(path.join(root, file))
  })),
  {
    label: "Sidebar contribution is registered",
    pass: packageJson?.contributes?.views?.nearbyCoders?.some((view) => view.id === "nearbyCoders.sidebar")
  },
  {
    label: "GitHub login uses VS Code authentication API",
    pass: authTs.includes("vscode.authentication.getSession")
  },
  {
    label: "Config supports VS Code settings and env fallback",
    pass: configTs.includes("NEARBY_CODERS_SUPABASE_URL") && configTs.includes("workspace.getConfiguration")
  },
  {
    label: "Sidebar webview uses Content Security Policy",
    pass: sidebarTs.includes("Content-Security-Policy")
  },
  {
    label: "Migration enables PostGIS",
    pass: /create extension if not exists postgis;/i.test(migrationSql)
  },
  {
    label: "Profiles table uses sequential account_id identity primary key",
    pass: /account_id bigint generated always as identity primary key/i.test(migrationSql)
  },
  {
    label: "Profiles table stores geography point location",
    pass: /location geography\(point,\s*4326\)/i.test(migrationSql)
  },
  {
    label: "RLS owner update policy exists",
    pass: /create policy "profiles_update_own"/i.test(migrationSql) && /with check \(auth\.uid\(\) = id\)/i.test(migrationSql)
  },
  {
    label: "match_coders RPC exists",
    pass: /create or replace function public\.match_coders/i.test(migrationSql)
  },
  {
    label: "README explains message passing",
    pass: /Message passing between extension and webview/i.test(readme)
  }
];

const failures = checks.filter((check) => !check.pass);

for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"} ${check.label}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} verification check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} verification checks passed.`);
