// Arma _site/ con SOLO lo que se publica en GitHub Pages: las páginas y sus
// recursos. Quedan afuera los scripts de verificación, la configuración de
// Tailwind/Playwright, node_modules y el README. Lo usa el workflow de Actions
// después de que todas las verificaciones pasaron.

import { cpSync, rmSync, mkdirSync } from "node:fs";

const PUBLICO = [
  "index.html",
  "catalogo.html",
  "producto.html",
  "sw.js",
  "manifest.webmanifest",
  "assets",
  "data",
  "js",
];

rmSync("_site", { recursive: true, force: true });
mkdirSync("_site");
for (const ruta of PUBLICO) cpSync(ruta, `_site/${ruta}`, { recursive: true });
// La fuente de Tailwind no hace falta en producción (solo el CSS compilado).
rmSync("_site/assets/tailwind.css", { force: true });
console.log(`✔ _site/ listo con: ${PUBLICO.join(", ")}`);
