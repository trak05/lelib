// Versions et outils partagés par le lanceur du serveur Playwright MCP (playwright.js)
// et par l'installation du navigateur (hooks/scripts/install-chromium.js).
const fs = require("fs");
const path = require("path");

// Version du serveur MCP. Le serveur dépend d'une version exacte de Playwright : les deux doivent
// évoluer ensemble. Vérifier avec : npm view @playwright/mcp@<version> dependencies
// En cas de changement, mettre aussi à jour la commande manuelle citée dans agents/qa.md et le README.
const PLAYWRIGHT_MCP_VERSION = "0.0.84";
const PLAYWRIGHT_VERSION = "1.65.0-alpha-2026-10-30";

// npx-cli.js livré avec Node : même commande sous Windows, macOS et Linux, sans `cmd /c npx`.
const nodeDir = path.dirname(process.execPath);
const npxCli = [
  path.join(nodeDir, "node_modules", "npm", "bin", "npx-cli.js"),
  path.join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npx-cli.js"),
].find((p) => fs.existsSync(p));

module.exports = { PLAYWRIGHT_MCP_VERSION, PLAYWRIGHT_VERSION, npxCli };
