'use strict';

// Lit un fichier Markdown à frontmatter simple (`clé: valeur`) : { meta, body }.
function lire(texte) {
  const normalise = texte.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalise);
  if (!m) return { meta: {}, body: normalise };
  const meta = {};
  for (const ligne of m[1].split('\n')) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(ligne);
    if (!kv) continue;
    let valeur = kv[2].trim();
    if (/^(".*"|'.*')$/.test(valeur)) valeur = valeur.slice(1, -1);
    meta[kv[1]] = valeur;
  }
  return { meta, body: m[2].trim() };
}

module.exports = { lire };
