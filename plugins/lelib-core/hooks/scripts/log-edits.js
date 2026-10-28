// Hook PostToolUse : journalise chaque fichier écrit ou modifié par Claude
// dans ~/.claude/lelib-edits.log. Claude Code envoie l'événement en JSON sur stdin.
const fs = require("fs");
const os = require("os");
const path = require("path");

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  try {
    const event = JSON.parse(input);
    const file = event.tool_input?.file_path ?? "?";
    const line = `${new Date().toISOString()}\t${event.tool_name}\t${file}\n`;
    fs.appendFileSync(path.join(os.homedir(), ".claude", "lelib-edits.log"), line);
  } catch {
    // Un hook ne doit jamais bloquer Claude : on ignore les erreurs.
  }
  process.exit(0);
});
