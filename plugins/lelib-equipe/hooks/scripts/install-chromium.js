// Hook SessionStart : installe Chromium pour Playwright (agent qa) au premier démarrage de session
// après l'ajout du plugin. L'installation tourne en arrière-plan et ne retarde pas la session.
// Le navigateur est installé une fois par machine (cache partagé de Playwright), pas par projet.
//
//   node install-chromium.js          mode hook : vérifie, lance l'installation en arrière-plan si besoin
//   node install-chromium.js --run    mode interne : exécute l'installation (lancé par le mode hook)
//
// Désactiver : LELIB_SKIP_BROWSER_INSTALL=1 (ou PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1)
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { PLAYWRIGHT_VERSION, npxCli } = require("../../mcp/common");

const dataDir = process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), ".claude", "lelib-equipe");
const marker = path.join(dataDir, `chromium-${PLAYWRIGHT_VERSION}.ok`);
const lock = path.join(dataDir, "install-chromium.lock");
const failed = path.join(dataDir, "install-chromium.failed");
const logFile = path.join(dataDir, "install-chromium.log");

const LOCK_MAX_AGE_MS = 15 * 60 * 1000; // une installation bloquée n'empêche pas d'en relancer une
const RETRY_AFTER_FAILURE_MS = 60 * 60 * 1000; // pas de nouvelle tentative avant 1 h après un échec

const age = (file) => { try { return Date.now() - fs.statSync(file).mtimeMs; } catch { return Infinity; } };

// Dossier où Playwright range les navigateurs.
function browsersDir() {
  const custom = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (custom && custom !== "0") return custom;
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "ms-playwright");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  return path.join(os.homedir(), ".cache", "ms-playwright");
}

// Le marqueur seul ne suffit pas : on vérifie aussi que le navigateur est toujours là (cache supprimé…).
function chromiumPresent() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH === "0") return true;
  try {
    return fs.readdirSync(browsersDir()).some(
      (d) => /^chromium-/.test(d) && fs.existsSync(path.join(browsersDir(), d, "INSTALLATION_COMPLETE"))
    );
  } catch { return false; }
}

function runInstall() {
  const args = ["--prefer-offline", "--yes", `playwright@${PLAYWRIGHT_VERSION}`, "install", "chromium"];
  console.log(`[${new Date().toISOString()}] npx ${args.join(" ")}`);
  const child = npxCli
    ? spawn(process.execPath, [npxCli, ...args], { stdio: "inherit" })
    : spawn("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
  const done = (code, why) => {
    try { fs.rmSync(lock, { force: true }); } catch {}
    if (code === 0) {
      fs.writeFileSync(marker, new Date().toISOString());
      fs.rmSync(failed, { force: true });
      console.log(`[${new Date().toISOString()}] Chromium installé.`);
    } else {
      fs.writeFileSync(failed, new Date().toISOString());
      console.log(`[${new Date().toISOString()}] Échec de l'installation (${why ?? "code " + code}).`);
    }
    process.exit(code === 0 ? 0 : 1);
  };
  child.on("error", (e) => done(1, e.message));
  child.on("exit", (code) => done(code ?? 1));
}

function runHook() {
  try {
    if (process.env.LELIB_SKIP_BROWSER_INSTALL === "1" || process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === "1") return;
    fs.mkdirSync(dataDir, { recursive: true });
    if (fs.existsSync(marker) && chromiumPresent()) return; // déjà installé : silence
    if (age(lock) < LOCK_MAX_AGE_MS) return; // installation déjà en cours (autre session)
    if (age(failed) < RETRY_AFTER_FAILURE_MS) return; // échec récent : on ne harcèle pas le réseau

    fs.writeFileSync(lock, new Date().toISOString());
    const log = fs.openSync(logFile, "a");
    spawn(process.execPath, [__filename, "--run"], {
      detached: true, stdio: ["ignore", log, log], windowsHide: true, env: process.env,
    }).unref();

    process.stdout.write(JSON.stringify({
      systemMessage: `🌐 lelib-equipe : installation de Chromium pour Playwright en arrière-plan (première fois, environ 700 Mo). Journal : ${logFile}`,
    }));
  } catch {
    // Un hook ne doit jamais bloquer la session.
  }
}

if (process.argv.includes("--run")) runInstall();
else { runHook(); process.exit(0); }
