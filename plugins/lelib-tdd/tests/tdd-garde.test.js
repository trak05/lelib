const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const a = require("./aide");
const { estProduction } = require("../scripts/tdd-garde");

const ROUGE = { cmd: "t", code: 1, etat: "rouge", cause: "assertion", echecs: [] };
const VERT = { cmd: "t", code: 0, etat: "vert" };
const entree = (outil, fichier) => JSON.stringify({ tool_name: outil, tool_input: { file_path: fichier } });
const PROD = "src/main/java/fr/x/CompteurService.java";

function garde(p, input, env = {}) {
  return a.lancer("tdd-garde.js", [], { cwd: p, input, env });
}
const contexte = (r) => JSON.parse(r.out).hookSpecificOutput.additionalContext;

test("estProduction : code Java et Angular de production", () => {
  assert.equal(estProduction("src/main/java/fr/x/A.java"), true);
  assert.equal(estProduction("backend/src/main/java/fr/x/service/A.java"), true);
  assert.equal(estProduction("frontend/src/app/login/login.component.ts"), true);
  assert.equal(estProduction("C:\\proj\\src\\main\\java\\fr\\A.java"), true, "chemin Windows");
});

test("estProduction : tests, configuration et code généré sont exclus", () => {
  for (const f of [
    "src/test/java/fr/x/ATest.java", "src/app/login/login.spec.ts", "src/app/x.test.ts", "src/main/resources/application.properties",
    "src/main/java/fr/x/BackendApplication.java", "src/app/app.routes.ts", "src/app/app.config.ts", "src/main.ts", "src/app/types.d.ts",
    "src/environments/environment.ts", "target/generated-sources/openapi/src/main/java/A.java", "src/app/api/generated/x.ts", "README.md", "pom.xml",
  ]) assert.equal(estProduction(f), false, f);
});

test("sans journal : avertissement (sortie 0) avec le message pour l'agent", () => {
  const p = a.projet();
  try {
    const r = garde(p, entree("Write", PROD));
    assert.equal(r.code, 0);
    assert.match(JSON.parse(r.out).systemMessage, /CompteurService\.java sans test rouge/);
    assert.match(contexte(r), /aucun lancement de tests enregistré/);
    assert.match(contexte(r), /tdd-run\.js/);
  } finally { a.nettoyer(p); }
});

test("dernier lancement rouge valide : la modification est silencieuse", () => {
  const p = a.projet();
  try {
    for (const cause of ["assertion", "compilation"]) {
      a.journal(p, [{ ...ROUGE, cause }]);
      const r = garde(p, entree("Edit", PROD));
      assert.equal(r.code, 0);
      assert.equal(r.out, "", cause);
    }
  } finally { a.nettoyer(p); }
});

test("dernier lancement vert : avertissement avec la piste du refactor", () => {
  const p = a.projet();
  try {
    a.journal(p, [ROUGE, VERT]);
    const r = garde(p, entree("Write", PROD));
    assert.equal(r.code, 0);
    assert.match(contexte(r), /tests sont verts/);
    assert.match(contexte(r), /--refactor/);
  } finally { a.nettoyer(p); }
});

test("rouge de cause inconnue : avertissement, ce n'est pas un vrai rouge", () => {
  const p = a.projet();
  try {
    a.journal(p, [{ ...ROUGE, cause: "inconnue" }]);
    assert.match(contexte(garde(p, entree("Write", PROD))), /pas un échec de test reconnu/);
  } finally { a.nettoyer(p); }
});

test("phase refactor après un vert : autorisée ; après un rouge : avertissement", () => {
  const p = a.projet();
  try {
    a.journal(p, [ROUGE, VERT, { marqueur: "refactor" }]);
    assert.equal(garde(p, entree("Edit", PROD)).out, "");
    a.journal(p, [ROUGE, { marqueur: "refactor" }]);
    assert.match(contexte(garde(p, entree("Edit", PROD))), /pas verts/);
  } finally { a.nettoyer(p); }
});

test("un journal ancien (plus de 8 h) ne compte pas", () => {
  const p = a.projet();
  try {
    a.journal(p, [{ ...ROUGE, il_y_a_min: 9 * 60 }]);
    assert.match(contexte(garde(p, entree("Write", PROD))), /aucun lancement de tests enregistré/);
    const r = garde(p, entree("Write", PROD), { LELIB_TDD_VALIDITE_H: "12" });
    assert.equal(r.out, "", "durée de validité réglable");
  } finally { a.nettoyer(p); }
});

test("les fichiers de test et de configuration passent toujours, même sans journal", () => {
  const p = a.projet();
  try {
    for (const f of ["src/test/java/fr/x/ATest.java", "src/app/x.spec.ts", "pom.xml", "src/main/resources/application.properties"]) {
      const r = garde(p, entree("Write", f));
      assert.equal(r.code, 0);
      assert.equal(r.out, "", f);
    }
  } finally { a.nettoyer(p); }
});

test("les autres outils (Read, Bash…) ne sont pas contrôlés", () => {
  const p = a.projet();
  try {
    assert.equal(garde(p, entree("Read", PROD)).out, "");
    assert.equal(garde(p, JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } })).out, "");
  } finally { a.nettoyer(p); }
});

test("LELIB_TDD=bloquer refuse (sortie 2) ; LELIB_TDD=off désactive", () => {
  const p = a.projet();
  try {
    const r = garde(p, entree("Write", PROD), { LELIB_TDD: "bloquer" });
    assert.equal(r.code, 2);
    assert.match(r.err, /refusée/);
    assert.equal(r.out, "");
    const off = garde(p, entree("Write", PROD), { LELIB_TDD: "off" });
    assert.equal(off.code, 0);
    assert.equal(off.out, "");
    a.journal(p, [ROUGE]);
    assert.equal(garde(p, entree("Write", PROD), { LELIB_TDD: "bloquer" }).code, 0, "bloquer laisse passer quand il y a un rouge");
  } finally { a.nettoyer(p); }
});

test("LELIB_TDD_IGNORER exclut des fichiers supplémentaires", () => {
  const p = a.projet();
  try {
    assert.equal(garde(p, entree("Write", "src/main/java/fr/x/dto/Dto.java"), { LELIB_TDD_IGNORER: "/dto/;motif[invalide" }).out, "");
  } finally { a.nettoyer(p); }
});

test("entrée invalide ou vide : jamais d'erreur (sortie 0)", () => {
  const p = a.projet();
  try {
    for (const input of ["", "pas du json", "null", "{}", JSON.stringify({ tool_name: "Write" }), JSON.stringify({ tool_name: "Write", tool_input: { file_path: 12 } })]) {
      const r = garde(p, input);
      assert.equal(r.code, 0, input);
      assert.equal(r.out, "", input);
    }
  } finally { a.nettoyer(p); }
});

test("la racine est celle du fichier modifié, pas celle du dossier courant", () => {
  const p = a.projet();
  const autre = a.projet();
  try {
    a.journal(p, [ROUGE]);
    const absolu = path.join(p, "backend", PROD);
    const r = garde(autre, entree("Write", absolu));
    assert.equal(r.out, "", "le journal du projet du fichier est lu");
    assert.match(contexte(garde(autre, entree("Write", path.join(autre, PROD)))), /aucun lancement/, "un autre projet n'hérite pas du rouge");
  } finally { a.nettoyer(p); a.nettoyer(autre); }
});
