// Serveur MCP minimal sur stdio, sans dépendance (JSON-RPC 2.0, un message par ligne).
// Pour un serveur plus riche, passer au SDK officiel : npm install @modelcontextprotocol/sdk
const readline = require("readline");

const tools = {
  ping: {
    description: "Vérifie que le serveur MCP lelib-tools répond.",
    inputSchema: { type: "object", properties: {} },
    run: () => "pong depuis lelib-tools",
  },
  date_fr: {
    description: "Renvoie la date et l'heure actuelles au format français (Europe/Paris).",
    inputSchema: { type: "object", properties: {} },
    run: () => new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" }),
  },
};

function handle(msg) {
  switch (msg.method) {
    case "initialize":
      return {
        protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "lelib-tools", version: "0.1.0" },
      };
    case "tools/list":
      return {
        tools: Object.entries(tools).map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      };
    case "tools/call": {
      const tool = tools[msg.params?.name];
      if (!tool) throw { code: -32602, message: `Outil inconnu : ${msg.params?.name}` };
      return { content: [{ type: "text", text: String(tool.run(msg.params.arguments ?? {})) }] };
    }
    case "ping":
      return {};
    default:
      throw { code: -32601, message: `Méthode non supportée : ${msg.method}` };
  }
}

const send = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON invalide" } });
  }
  // Les notifications (sans id) n'attendent pas de réponse.
  if (msg.id === undefined) return;
  try {
    send({ jsonrpc: "2.0", id: msg.id, result: handle(msg) });
  } catch (err) {
    send({ jsonrpc: "2.0", id: msg.id, error: { code: err.code ?? -32603, message: err.message ?? String(err) } });
  }
});
