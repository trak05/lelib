// Lance le serveur MCP Playwright (@playwright/mcp) en stdio, pour l'agent qa.
// La version est épinglée (voir common.js) pour des tests reproductibles.
//
// Variables d'environnement (toutes facultatives) :
//   LELIB_PLAYWRIGHT_BROWSER=chromium   navigateur utilisé (chromium par défaut ; chrome, msedge, firefox…)
//   LELIB_PLAYWRIGHT_HEADLESS=1   navigateur sans fenêtre (automatique quand CI est définie)
//   LELIB_QA_ORIGINS="http://localhost:4200;http://localhost:8080"
//                                 seules origines que le navigateur peut joindre
const { spawn } = require("child_process");
const { PLAYWRIGHT_MCP_VERSION, npxCli } = require("./common");

// Par défaut le serveur cherche Google Chrome installé sur la machine ; on lui impose le Chromium
// de Playwright, celui qu'installe le hook install-chromium.js.
const browser = process.env.LELIB_PLAYWRIGHT_BROWSER || "chromium";
const args = ["--yes", `@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}`, "--isolated", "--browser", browser];
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
