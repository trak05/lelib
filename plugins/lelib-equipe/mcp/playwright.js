// Lance le serveur MCP Playwright (@playwright/mcp) en stdio, pour l'agent qa.
// Passe par le npx-cli.js livré avec Node : même commande sous Windows, macOS et Linux,
// sans `cmd /c npx`. La version est épinglée pour des tests reproductibles.
//
// Variables d'environnement (toutes facultatives) :
//   LELIB_PLAYWRIGHT_HEADLESS=1   navigateur sans fenêtre (automatique quand CI est définie)
//   LELIB_QA_ORIGINS="http://localhost:4200;http://localhost:8080"
//                                 seules origines que le navigateur peut joindre
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const VERSION = "0.0.84";

const nodeDir = path.dirname(process.execPath);
const npxCli = [
  path.join(nodeDir, "node_modules", "npm", "bin", "npx-cli.js"),
  path.join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npx-cli.js"),
].find((p) => fs.existsSync(p));

const args = ["--yes", `@playwright/mcp@${VERSION}`, "--isolated"];
if (process.env.CI || process.env.LELIB_PLAYWRIGHT_HEADLESS === "1") args.push("--headless");
if (process.env.LELIB_QA_ORIGINS) args.push("--allowed-origins", process.env.LELIB_QA_ORIGINS);

const child = npxCli
  ? spawn(process.execPath, [npxCli, ...args], { stdio: "inherit" })
  : spawn("npx", args, { stdio: "inherit", shell: process.platform === "win32" });

child.on("error", (err) => {
  console.error("Impossible de lancer Playwright MCP :", err.message);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill());
