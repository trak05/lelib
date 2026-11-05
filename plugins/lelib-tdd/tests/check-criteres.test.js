const test = require("node:test");
const assert = require("node:assert/strict");
const a = require("./aide");

const TICKET = (criteres, id = "bet-003") => `---\nid: ${id}\ntitre: Connexion\nstatut: en-cours\n---\n\n# ${id} — Connexion\n\n## Contexte\nx\n\n## Critères d'acceptation\n${criteres}\n\n## Hors périmètre\n- CA-9 : ceci n'est pas un critère\n`;
const DEUX = "- [ ] CA-1 : un utilisateur valide se connecte\n- [x] CA-2 : un mot de passe vide est refusé";

function rapport(p, args = []) {
  const r = a.lancer("check-criteres.js", [...args, "--json"], { cwd: p });
  let json = null;
  try { json = JSON.parse(r.out); } catch { /* sortie non JSON */ }
  return { code: r.code, json, out: r.out };
}

test("tous les critères cités par un test : code 0", () => {
  const p = a.projet();
  try {
    a.ecrire(p, "tickets/bet-003.md", TICKET(DEUX));
    a.ecrire(p, "src/test/java/fr/x/LoginTest.java", '@DisplayName("[bet-003 CA-1] connecte")\n@DisplayName("[bet-003 CA-2] refuse")');
    const r = rapport(p, ["bet-003"]);
    assert.equal(r.code, 0);
    assert.deepEqual(r.json[0].criteres.map((c) => c.couvert), [true, true]);
    assert.deepEqual(r.json[0].criteres[0].tests, ["src/test/java/fr/x/LoginTest.java"]);
  } finally { a.nettoyer(p); }
});

test("un critère sans test : code 1 et il est désigné", () => {
  const p = a.projet();
  try {
    a.ecrire(p, "tickets/bet-003.md", TICKET(DEUX));
    a.ecrire(p, "src/app/login.spec.ts", "it('[bet-003 CA-1] connecte', () => {});");
    const r = rapport(p, ["bet-003"]);
    assert.equal(r.code, 1);
    assert.deepEqual(r.json[0].criteres.filter((c) => !c.couvert).map((c) => c.numero), [2]);
    const texte = a.lancer("check-criteres.js", ["bet-003"], { cwd: p });
    assert.match(texte.out, /1\/2 critère\(s\) couvert\(s\)/);
    assert.match(texte.out, /✗ CA-2/);
  } finally { a.nettoyer(p); }
});

test("CA-1 n'est pas couvert par un test qui cite CA-10, ni bet-003 par bet-0031", () => {
  const p = a.projet();
  try {
    a.ecrire(p, "tickets/bet-003.md", TICKET("- [ ] CA-1 : un"));
    a.ecrire(p, "src/app/a.spec.ts", "it('[bet-003 CA-10] x'); it('[bet-0031 CA-1] y');");
    assert.equal(rapport(p, ["bet-003"]).code, 1);
  } finally { a.nettoyer(p); }
});

test("les séparateurs usuels entre ticket et critère sont acceptés", () => {
  const p = a.projet();
  try {
    a.ecrire(p, "tickets/bet-003.md", TICKET("- [ ] CA-1 : a\n- [ ] CA-2 : b\n- [ ] CA-3 : c"));
    a.ecrire(p, "e2e/login.e2e.ts", "test('bet-003/CA-1 a'); test('bet-003: CA-2 b'); test('BET-003 - ca3 c');");
    assert.equal(rapport(p, ["bet-003"]).code, 0);
  } finally { a.nettoyer(p); }
});

test("les fichiers sous node_modules, target et tickets ne comptent pas comme tests", () => {
  const p = a.projet();
  try {
    a.ecrire(p, "tickets/bet-003.md", TICKET("- [ ] CA-1 : a"));
    a.ecrire(p, "node_modules/x/a.spec.js", "[bet-003 CA-1]");
    a.ecrire(p, "target/classes/ATest.java", "[bet-003 CA-1]");
    assert.equal(rapport(p, ["bet-003"]).code, 1);
  } finally { a.nettoyer(p); }
});

test("une mention dans un fichier qui n'est pas un test ne couvre pas le critère", () => {
  const p = a.projet();
  try {
    a.ecrire(p, "tickets/bet-003.md", TICKET("- [ ] CA-1 : a"));
    a.ecrire(p, "src/main/java/fr/x/Service.java", "// [bet-003 CA-1]");
    assert.equal(rapport(p, ["bet-003"]).code, 1);
  } finally { a.nettoyer(p); }
});

test("critères non numérotés : avertissement, numéros déduits de l'ordre", () => {
  const p = a.projet();
  try {
    a.ecrire(p, "tickets/bet-003.md", TICKET("- [ ] se connecte\n- [ ] refuse le vide"));
    a.ecrire(p, "src/test/java/LoginTest.java", "[bet-003 CA-2]");
    const r = rapport(p, ["bet-003"]);
    assert.equal(r.code, 1);
    assert.ok(r.json[0].avertissements.some((x) => /non numérotés/.test(x)));
    assert.deepEqual(r.json[0].criteres.map((c) => c.couvert), [false, true]);
  } finally { a.nettoyer(p); }
});

test("ticket sans critères : avertissement et code 0", () => {
  const p = a.projet();
  try {
    a.ecrire(p, "tickets/bet-003.md", TICKET(""));
    const r = rapport(p, ["bet-003"]);
    assert.equal(r.code, 0);
    assert.ok(r.json[0].avertissements.some((x) => /aucun critère/.test(x)));
  } finally { a.nettoyer(p); }
});

test("le ticket se retrouve par identifiant, dans done/, ou par chemin", () => {
  const p = a.projet();
  try {
    a.ecrire(p, "tickets/done/bet-004-export.md", TICKET("- [ ] CA-1 : a", "bet-004"));
    a.ecrire(p, "src/app/a.spec.ts", "[bet-004 CA-1]");
    assert.equal(rapport(p, ["bet-004"]).code, 0);
    assert.equal(rapport(p, ["tickets/done/bet-004-export.md"]).code, 0);
  } finally { a.nettoyer(p); }
});

test("sans argument : tous les tickets de tickets/, hors done/", () => {
  const p = a.projet();
  try {
    a.ecrire(p, "tickets/bet-001.md", TICKET("- [ ] CA-1 : a", "bet-001"));
    a.ecrire(p, "tickets/bet-002.md", TICKET("- [ ] CA-1 : a", "bet-002"));
    a.ecrire(p, "tickets/done/bet-000.md", TICKET("- [ ] CA-1 : a", "bet-000"));
    a.ecrire(p, "src/app/a.spec.ts", "[bet-001 CA-1]");
    const r = rapport(p);
    assert.deepEqual(r.json.map((x) => x.id), ["bet-001", "bet-002"]);
    assert.equal(r.code, 1, "bet-002 n'a pas de test");
  } finally { a.nettoyer(p); }
});

test("ticket ou dossier introuvable : code 2", () => {
  const p = a.projet();
  try {
    assert.equal(rapport(p, ["bet-999"]).code, 2);
    assert.equal(rapport(p).code, 2, "pas de dossier tickets/");
  } finally { a.nettoyer(p); }
});

test("l'identifiant vient de l'en-tête, sinon du nom de fichier", () => {
  const p = a.projet();
  try {
    a.ecrire(p, "tickets/opa-007-titre.md", "# sans en-tête\n\n## Critères d'acceptation\n- [ ] CA-1 : a\n");
    a.ecrire(p, "src/app/a.spec.ts", "[opa-007 CA-1]");
    const r = rapport(p, ["opa-007"]);
    assert.equal(r.json[0].id, "opa-007");
    assert.equal(r.code, 0);
  } finally { a.nettoyer(p); }
});

test("fins de ligne Windows (CRLF) acceptées", () => {
  const p = a.projet();
  try {
    a.ecrire(p, "tickets/bet-003.md", TICKET("- [ ] CA-1 : a").replace(/\n/g, "\r\n"));
    a.ecrire(p, "src/app/a.spec.ts", "[bet-003 CA-1]");
    assert.equal(rapport(p, ["bet-003"]).code, 0);
  } finally { a.nettoyer(p); }
});
