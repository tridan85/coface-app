#!/usr/bin/env node
// Uso: node scripts/any2utf8.mjs input.txt output.txt
import fs from "fs";

const [,, input, output] = process.argv;
if (!input || !output) {
  console.error("Uso: node scripts/any2utf8.mjs <input> <output>");
  process.exit(1);
}

const buf = fs.readFileSync(input);
let txt;

function isUtf16Like(b) {
  let zeros = 0;
  for (let i = 0; i < b.length; i++) if (b[i] === 0) zeros++;
  return zeros > b.length * 0.2;
}

if (buf[0] === 0xFF && buf[1] === 0xFE) {
  // UTF-16 LE con BOM
  txt = buf.toString("utf16le", 2);
} else if (buf[0] === 0xFE && buf[1] === 0xFF) {
  // UTF-16 BE con BOM -> swap byte e decodifica LE
  const swapped = Buffer.alloc(buf.length - 2);
  for (let i = 2, j = 0; i < buf.length; i += 2) {
    swapped[j++] = buf[i + 1];
    swapped[j++] = buf[i];
  }
  txt = swapped.toString("utf16le");
} else if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
  // UTF-8 con BOM
  txt = buf.toString("utf8", 3);
} else if (isUtf16Like(buf)) {
  // Tanti byte 0x00: probabile UTF-16 LE senza BOM
  txt = buf.toString("utf16le");
} else {
  // Fallback: prova UTF-8 “puro”
  txt = buf.toString("utf8");
}

// Scrivi in UTF-8 con BOM (massima compatibilità editor Windows)
fs.writeFileSync(output, "\uFEFF" + txt, { encoding: "utf8" });
console.log(`OK: ${output} scritto in UTF-8 con BOM`);
