// Verificación estática del sitio (no abre navegador). La corre GitHub Actions antes
// de publicar; también se puede correr a mano: npm run verificar:estatico
//
// Comprueba:
//   1. Sintaxis de todo el JavaScript (node --check).
//   2. data/productos.json: estructura, ids únicos, categorías, al menos 3 fotos por
//      kit, alt y crédito CC de cada foto, y que cada archivo de imagen exista.
//   3. Que todo lo que precarga el Service Worker exista.
//   4. manifest.webmanifest válido y con íconos existentes.
//   5. Que cada src/href local de las páginas apunte a un archivo existente.
//   6. Que assets/styles.css esté compilado con la última versión de Tailwind
//      (si alguien cambia clases y no corre build:css, el sitio se vería roto).
//
// Termina con código 1 si algo falla, así el job de Actions se marca en rojo y
// no se publica.

import { readFileSync, existsSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const errores = [];
const ok = (mensaje) => console.log(`  ✔ ${mensaje}`);
const fallo = (mensaje) => errores.push(mensaje);
const seccion = (titulo) => console.log(`\n▶ ${titulo}`);

const leerJSON = (ruta) => {
  try {
    return JSON.parse(readFileSync(ruta, "utf8"));
  } catch (error) {
    fallo(`${ruta}: JSON inválido (${error.message})`);
    return null;
  }
};

// ---------------------------------------------------------------- 1. JavaScript
seccion("Sintaxis de JavaScript");
const archivosJS = [...readdirSync("js").map((f) => join("js", f)), "sw.js"].filter((f) => f.endsWith(".js"));
for (const archivo of archivosJS) {
  try {
    execFileSync(process.execPath, ["--check", archivo], { stdio: "pipe" });
  } catch (error) {
    fallo(`${archivo}: error de sintaxis\n${error.stderr}`);
  }
}
ok(`${archivosJS.length} archivos revisados`);

// ---------------------------------------------------------------- 2. Catálogo
seccion("Catálogo (data/productos.json)");
const MIN_FOTOS = 3;
const LICENCIAS = /^CC BY(-SA)? \d\.\d$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const FOCO = /^\d{1,3}% \d{1,3}%$/;
const catalogo = leerJSON("data/productos.json");
if (catalogo) {
  const { categorias = [], productos = [] } = catalogo;
  if (!catalogo.version) fallo("productos.json: falta 'version' (el SW y repo.js la usan para sincronizar)");
  const idsCategoria = new Set();
  for (const c of categorias) {
    if (!c.id || !c.nombre) fallo(`categoría sin id o nombre: ${JSON.stringify(c)}`);
    if (idsCategoria.has(c.id)) fallo(`categoría repetida: ${c.id}`);
    idsCategoria.add(c.id);
    if (!existsSync(c.imagen ?? "")) fallo(`categoría ${c.id}: no existe la imagen ${c.imagen}`);
    if (c.foco !== undefined && !FOCO.test(c.foco)) fallo(`categoría ${c.id}: foco inválido "${c.foco}"`);
  }

  const ids = new Set();
  let fotos = 0;
  for (const p of productos) {
    const donde = `producto ${p.id ?? "(sin id)"}`;
    for (const campo of ["id", "nombre", "marca", "linea", "franquicia", "serie", "escala", "dificultad", "descripcion", "imagen", "alt", "categoria"]) {
      if (typeof p[campo] !== "string" || !p[campo].trim()) fallo(`${donde}: falta el campo "${campo}"`);
    }
    if (ids.has(p.id)) fallo(`${donde}: id repetido`);
    ids.add(p.id);
    if (!/^[a-z0-9-]+$/.test(p.id ?? "")) fallo(`${donde}: el id solo puede tener minúsculas, números y guiones (va en la URL)`);
    if (!Number.isFinite(p.precio) || p.precio <= 0) fallo(`${donde}: precio inválido`);
    if (!Number.isInteger(p.stock) || p.stock < 0) fallo(`${donde}: stock inválido`);
    if (!/^1\/\d+$/.test(p.escala ?? "")) fallo(`${donde}: escala con formato distinto de 1/N`);
    if (!idsCategoria.has(p.categoria)) fallo(`${donde}: la categoría "${p.categoria}" no existe`);
    if (typeof p.nuevo !== "boolean") fallo(`${donde}: "nuevo" debe ser true o false`);
    if (!FECHA.test(p.ingreso ?? "")) fallo(`${donde}: "ingreso" debe ser AAAA-MM-DD`);

    const galeria = Array.isArray(p.imagenes) ? p.imagenes : [];
    if (galeria.length < MIN_FOTOS) fallo(`${donde}: tiene ${galeria.length} fotos, el mínimo es ${MIN_FOTOS}`);
    if (galeria[0]?.src !== p.imagen) fallo(`${donde}: la primera foto de la galería debe ser la imagen principal`);
    const srcs = new Set();
    galeria.forEach((foto, i) => {
      const f = `${donde}, foto ${i + 1}`;
      fotos += 1;
      if (!existsSync(foto.src ?? "")) fallo(`${f}: no existe el archivo ${foto.src}`);
      if (srcs.has(foto.src)) fallo(`${f}: foto repetida ${foto.src}`);
      srcs.add(foto.src);
      if (!foto.alt?.trim()) fallo(`${f}: falta el texto alternativo (WCAG 1.1.1)`);
      const cr = foto.credito ?? {};
      if (!cr.autor?.trim()) fallo(`${f}: falta el autor`);
      if (!LICENCIAS.test(cr.licencia ?? "")) fallo(`${f}: licencia "${cr.licencia}" no es CC BY / CC BY-SA`);
      if (!/^https:\/\//.test(cr.fuente ?? "")) fallo(`${f}: la fuente debe ser una URL https`);
    });
  }
  ok(`${categorias.length} categorías, ${productos.length} productos, ${fotos} fotos`);
}

// ---------------------------------------------------------------- 3. Service Worker
seccion("Service Worker (sw.js)");
const sw = readFileSync("sw.js", "utf8");
if (!/const VERSION = "v\d+\.\d+\.\d+";/.test(sw)) fallo("sw.js: falta const VERSION = \"vX.Y.Z\"");
const bloquePrecarga = sw.slice(sw.indexOf("const PAGINAS"), sw.indexOf("const URL_DATOS"));
const precargados = [...bloquePrecarga.matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
for (const ruta of precargados) if (!existsSync(ruta)) fallo(`sw.js precarga "${ruta}", que no existe`);
for (const archivo of archivosJS.filter((f) => f.startsWith("js/"))) {
  if (!precargados.includes(archivo)) fallo(`sw.js no precarga ${archivo}: esa página fallaría sin conexión`);
}
ok(`${precargados.length} archivos precargados, todos existen`);

// ---------------------------------------------------------------- 4. Manifest
seccion("Manifest de la PWA");
const manifest = leerJSON("manifest.webmanifest");
if (manifest) {
  for (const campo of ["name", "short_name", "start_url", "display", "icons"]) {
    if (!manifest[campo]) fallo(`manifest: falta "${campo}"`);
  }
  for (const icono of manifest.icons ?? []) if (!existsSync(icono.src)) fallo(`manifest: no existe el ícono ${icono.src}`);
  if (!(manifest.icons ?? []).some((i) => i.purpose === "maskable")) fallo("manifest: falta un ícono maskable");
  ok(`${manifest.icons?.length ?? 0} íconos`);
}

// ---------------------------------------------------------------- 5. Enlaces locales
seccion("Enlaces y recursos locales de las páginas");
const PAGINAS = ["index.html", "catalogo.html", "producto.html"];
let enlaces = 0;
for (const pagina of PAGINAS) {
  const html = readFileSync(pagina, "utf8");
  for (const [, ruta] of html.matchAll(/(?:src|href)="([^"#?:]+)(?:[?#][^"]*)?"/g)) {
    enlaces += 1;
    if (!existsSync(ruta)) fallo(`${pagina}: apunta a "${ruta}", que no existe`);
  }
}
ok(`${enlaces} referencias revisadas`);

// ---------------------------------------------------------------- 6. CSS compilado
seccion("CSS de Tailwind compilado y al día");
const temporal = mkdtempSync(join(tmpdir(), "hk-css-"));
try {
  const salida = join(temporal, "styles.css");
  execFileSync("npx", ["tailwindcss", "-i", "./assets/tailwind.css", "-o", salida, "--minify"], { stdio: "pipe" });
  if (readFileSync(salida, "utf8") !== readFileSync("assets/styles.css", "utf8")) {
    fallo("assets/styles.css está desactualizado: corre `npm run build:css` y vuelve a subir");
  } else {
    ok("assets/styles.css coincide con lo que genera Tailwind");
  }
} catch (error) {
  fallo(`no se pudo compilar Tailwind: ${error.stderr ?? error.message}`);
} finally {
  rmSync(temporal, { recursive: true, force: true });
}

// ---------------------------------------------------------------- Resultado
console.log("");
if (errores.length) {
  console.error(`✘ ${errores.length} problema(s):`);
  errores.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
console.log("✔ Verificación estática sin problemas.");
