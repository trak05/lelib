// Convertit un rapport HTML en PDF (A4) avec le Chromium de Playwright, celui qu'installe le hook
// install-chromium.js. Aucune dépendance : passe par la commande `playwright pdf`, à la version
// épinglée dans mcp/common.js.
//
//   node html-to-pdf.js <rapport.html> <rapport.pdf>
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { PLAYWRIGHT_VERSION, npxCli } = require("../mcp/common");

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("Usage : node html-to-pdf.js <rapport.html> <rapport.pdf>");
  process.exit(2);
}
const inFile = path.resolve(input);
const outFile = path.resolve(output);
if (!fs.existsSync(inFile)) {
  console.error(`Fichier introuvable : ${inFile}`);
  process.exit(2);
}
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.rmSync(outFile, { force: true });

const args = [
  "--prefer-offline", "--yes", `playwright@${PLAYWRIGHT_VERSION}`, "pdf",
  "--browser", "chromium", "--paper-format", "A4", "--wait-for-timeout", "500",
  pathToFileURL(inFile).href, outFile,
];
const child = npxCli
  ? spawn(process.execPath, [npxCli, ...args], { stdio: ["ignore", "pipe", "pipe"] })
  : spawn("npx", args, { stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });

let log = "";
child.stdout.on("data", (d) => (log += d));
child.stderr.on("data", (d) => (log += d));
child.on("error", (e) => { console.error("Impossible de lancer Playwright :", e.message); process.exit(1); });
child.on("exit", (code) => {
  if (code === 0 && fs.existsSync(outFile) && fs.statSync(outFile).size > 0) {
    console.log(outFile);
    process.exit(0);
  }
  console.error(log.trim().slice(-1500));
  if (/Executable doesn't exist|browserType\.launch|install/i.test(log))
    console.error(`\nChromium semble absent : son installation est lancée au démarrage de session. Manuellement : npx playwright@${PLAYWRIGHT_VERSION} install chromium`);
  process.exit(1);
});
