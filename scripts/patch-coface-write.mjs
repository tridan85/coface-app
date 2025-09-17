#!/usr/bin/env node
// patch-coface-write.mjs
// Uso: node scripts/patch-coface-write.mjs input.txt output.txt

import fs from "fs";

const [,, input, output] = process.argv;

if (!input || !output) {
  console.error("Uso: node scripts/patch-coface-write.mjs input.txt output.txt");
  process.exit(1);
}

const content = fs.readFileSync(input, "utf8");

// Scrivi con BOM (U+FEFF all'inizio)
fs.writeFileSync(output, "\uFEFF" + content, { encoding: "utf8" });

console.log(`Scritto ${output} in UTF-8 con BOM`);
