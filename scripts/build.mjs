import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  platform: "node",
  external: ["vscode"],
  format: "cjs",
  sourcemap: true,
});

await esbuild.build({
  entryPoints: ["webview/main.ts"],
  bundle: true,
  outfile: "dist/webview/main.js",
  format: "esm",
  sourcemap: true,
});