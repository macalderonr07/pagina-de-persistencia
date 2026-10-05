// Pruebas de extremo a extremo en un navegador real (Chromium con Playwright).
// Las corre GitHub Actions antes de publicar; a mano: npm run verificar:e2e
//
// Levanta su propio servidor estático (localhost es "contexto seguro", así que el
// Service Worker funciona) y comprueba, en escritorio y en celulares emulados:
//   - Sin errores de JavaScript ni en consola.
//   - Sin scroll horizontal (la página cabe en la pantalla).
//   - Accesibilidad WCAG 2.2 AA con axe-core: 0 violaciones.
//   - Funciones clave: filtros por URL, galería, carrito, carrusel automático y
//     su pausa, ficha inexistente y funcionamiento SIN CONEXIÓN.
//
// Los valores esperados se calculan desde data/productos.json (no están fijos en
// el código), así la prueba sigue sirviendo si se agregan kits.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";
import { chromium, devices } from "playwright";

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const CATALOGO = JSON.parse(readFileSync("data/productos.json", "utf8"));
const RAIZ = process.cwd();

// ------------------------------------------------------------ servidor estático
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};
const servidor = createServer(async (req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const archivo = normalize(join(RAIZ, ruta.endsWith("/") ? `${ruta}index.html` : ruta));
  if (!archivo.startsWith(RAIZ)) return res.writeHead(403).end();
  try {
    const cuerpo = await readFile(archivo);
    res.writeHead(200, { "Content-Type": TIPOS[extname(archivo)] ?? "application/octet-stream" }).end(cuerpo);
  } catch {
    res.writeHead(404).end("No encontrado");
  }
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const BASE = `http://localhost:${servidor.address().port}/`;

// ------------------------------------------------------------ mini framework
const fallos = [];
let pruebas = 0;
async function prueba(nombre, fn) {
  pruebas += 1;
  try {
    await fn();
    console.log(`  ✔ ${nombre}`);
  } catch (error) {
    fallos.push(`${nombre}: ${error.message}`);
    console.log(`  ✘ ${nombre}\n      ${error.message}`);
  }
}
function esperar(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

// Errores de JS y de consola de cada página (se revisan al final de cada prueba).
function vigilar(pagina) {
  const errores = [];
  pagina.on("pageerror", (e) => errores.push(`JS: ${e.message}`));
  pagina.on("console", (m) => m.type() === "error" && errores.push(`consola: ${m.text()}`));
  return errores;
}

async function revisarPagina(pagina, ruta, errores) {
  // Se juntan TODOS los problemas de la página antes de fallar, para que el
  // reporte de Actions los muestre de una vez (no de a uno por ejecución).
  const problemas = [];
  await pagina.goto(BASE + ruta);
  await pagina.waitForLoadState("networkidle");
  const { ancho, pantalla } = await pagina.evaluate(() => ({
    ancho: document.documentElement.scrollWidth,
    pantalla: document.documentElement.clientWidth,
  }));
  if (ancho > pantalla) problemas.push(`hay scroll horizontal (${ancho}px de contenido en ${pantalla}px de pantalla)`);
  await pagina.addScriptTag({ content: AXE });
  const { violations } = await pagina.evaluate(() =>
    window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })
  );
  if (violations.length) {
    problemas.push(
      `axe encontró ${violations.length} violación(es): ` +
        violations.map((v) => `${v.id} (${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")})`).join("; ")
    );
  }
  problemas.push(...errores);
  esperar(problemas.length === 0, problemas.join("\n      "));
}

// ------------------------------------------------------------ pruebas
const navegador = await chromium.launch();
const PAGINAS = ["index.html", "catalogo.html", `producto.html?id=${CATALOGO.productos[0].id}`];
const DISPOSITIVOS = {
  "escritorio 1366px": { viewport: { width: 1366, height: 900 } },
  "iPhone SE (320px)": devices["iPhone SE"],
  "Pixel 5": devices["Pixel 5"],
  "iPad Mini": devices["iPad Mini"],
};

try {
  console.log("\n▶ Páginas: errores, scroll horizontal y accesibilidad (axe, WCAG 2.2 AA)");
  for (const [nombre, opciones] of Object.entries(DISPOSITIVOS)) {
    const contexto = await navegador.newContext(opciones);
    for (const ruta of PAGINAS) {
      await prueba(`${nombre} · ${ruta}`, async () => {
        const pagina = await contexto.newPage();
        const errores = vigilar(pagina);
        await revisarPagina(pagina, ruta, errores);
        await pagina.close();
      });
    }
    await contexto.close();
  }

  console.log("\n▶ Funciones");
  const contexto = await navegador.newContext({ viewport: { width: 1366, height: 900 } });
  const pagina = await contexto.newPage();
  const errores = vigilar(pagina);

  await prueba("Portada: carrusel con todas las novedades y 7 barras de categorías", async () => {
    await pagina.goto(BASE + "index.html");
    await pagina.mouse.move(700, 10); // fuera del carrusel (el hover lo pausa)
    await pagina.waitForSelector(".carrusel-diapositiva.activa");
    const novedades = CATALOGO.productos.filter((p) => p.nuevo).length;
    const diapositivas = await pagina.locator(".carrusel-diapositiva").count();
    esperar(diapositivas === Math.min(novedades, 6), `hay ${diapositivas} diapositivas, se esperaban ${Math.min(novedades, 6)}`);
    const barras = await pagina.locator(".barra").count();
    esperar(barras === CATALOGO.categorias.length, `hay ${barras} barras, se esperaban ${CATALOGO.categorias.length}`);
  });

  const activa = () =>
    pagina.evaluate(() => [...document.querySelectorAll(".carrusel-diapositiva")].findIndex((d) => d.classList.contains("activa")));

  await prueba("Carrusel: avanza solo al terminar la barra de progreso (~6 s)", async () => {
    const antes = await activa();
    await pagina.waitForFunction((a) => {
      const i = [...document.querySelectorAll(".carrusel-diapositiva")].findIndex((d) => d.classList.contains("activa"));
      return i !== a;
    }, antes, { timeout: 9000 });
  });

  await prueba("Carrusel: el botón Pausar detiene la rotación (WCAG 2.2.2)", async () => {
    await pagina.click("[data-pausa]");
    await pagina.mouse.move(700, 10);
    const antes = await activa();
    await pagina.waitForTimeout(7000);
    esperar((await activa()) === antes, "siguió rotando estando en pausa");
    const texto = await pagina.textContent("[data-pausa] [data-texto]");
    esperar(texto === "Reanudar", `el botón dice "${texto}" en vez de "Reanudar"`);
  });

  await prueba("Categoría desde la portada: filtra el catálogo por URL", async () => {
    const categoria = CATALOGO.categorias[0];
    const esperados = CATALOGO.productos.filter((p) => p.categoria === categoria.id).length;
    await pagina.click(".barra:first-child a");
    await pagina.waitForURL(/catalogo\.html\?categoria=/);
    await pagina.waitForSelector("#lista-productos li");
    const tarjetas = await pagina.locator("#lista-productos > li").count();
    esperar(tarjetas === esperados, `se muestran ${tarjetas} kits de "${categoria.nombre}", se esperaban ${esperados}`);
    const titulo = await pagina.textContent("#titulo-catalogo");
    esperar(titulo === categoria.nombre, `el título dice "${titulo}"`);
  });

  await prueba("Búsqueda por texto con el botón Buscar", async () => {
    await pagina.goto(BASE + "catalogo.html");
    await pagina.fill("#filtro-texto", "barbatos");
    await pagina.click("#form-filtros button[type=submit]");
    await pagina.waitForTimeout(300);
    const tarjetas = await pagina.locator("#lista-productos > li").count();
    esperar(tarjetas >= 1, "la búsqueda 'barbatos' no devolvió resultados");
    esperar(pagina.url().includes("q=barbatos"), "la búsqueda no quedó en la URL");
  });

  const conGaleria = CATALOGO.productos.reduce((a, b) => (b.imagenes.length > a.imagenes.length ? b : a));
  await prueba(`Ficha: galería de ${conGaleria.imagenes.length} fotos navegable (${conGaleria.id})`, async () => {
    await pagina.goto(BASE + `producto.html?id=${conGaleria.id}`);
    await pagina.waitForSelector("#galeria-miniaturas button");
    const miniaturas = await pagina.locator("#galeria-miniaturas button").count();
    esperar(miniaturas === conGaleria.imagenes.length, `hay ${miniaturas} miniaturas`);
    await pagina.click("#galeria-siguiente");
    const contador = await pagina.textContent("#galeria-contador");
    esperar(contador === `Foto 2 de ${miniaturas}`, `el contador dice "${contador}"`);
    const src = await pagina.getAttribute("#ficha-img", "src");
    esperar(src === conGaleria.imagenes[1].src, `muestra ${src}`);
  });

  const enStock = CATALOGO.productos.find((p) => p.stock >= 2);
  await prueba("Carrito: agregar 2 unidades desde la ficha actualiza el contador", async () => {
    await pagina.goto(BASE + `producto.html?id=${enStock.id}`);
    await pagina.waitForSelector("#ficha:not([hidden])");
    await pagina.fill("#ficha-cantidad", "2");
    await pagina.click("#ficha-agregar");
    const contador = await pagina.textContent("#contador-carrito");
    esperar(contador === "2", `el contador del carrito dice ${contador}`);
  });

  await prueba("Ficha inexistente muestra 'No encontramos ese kit' (sin inyectar el id)", async () => {
    await pagina.goto(BASE + "producto.html?id=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E");
    await pagina.waitForSelector("#no-encontrado:not([hidden])");
    const inyectado = await pagina.locator("img[src=x]").count();
    esperar(inyectado === 0, "el id de la URL se insertó como HTML");
  });

  await prueba("Sin conexión: las 3 páginas y las fotos de la galería abren desde la caché", async () => {
    await pagina.goto(BASE + "index.html");
    await pagina.evaluate(() => navigator.serviceWorker.ready);
    // Espera a que el SW termine de precargar (las 88 fotos incluidas).
    await pagina.waitForFunction(async () => {
      const nombres = await caches.keys();
      let total = 0;
      for (const n of nombres) total += (await (await caches.open(n)).keys()).length;
      return total > 50;
    }, null, { timeout: 30000 });
    await contexto.setOffline(true);
    for (const ruta of ["index.html", "catalogo.html", `producto.html?id=${conGaleria.id}`]) {
      await pagina.goto(BASE + ruta);
      await pagina.waitForLoadState("domcontentloaded");
      const titulo = await pagina.title();
      esperar(titulo.includes("Hangar Kits"), `${ruta} no abrió sin conexión (título "${titulo}")`);
    }
    await pagina.waitForSelector("#galeria-miniaturas button");
    await pagina.click("#galeria-miniaturas li:last-child button");
    await pagina.waitForFunction(() => {
      const i = document.querySelector("#ficha-img");
      return i.complete && i.naturalWidth > 0;
    }, null, { timeout: 5000 });
    await contexto.setOffline(false);
  });

  await prueba("Sin errores de JavaScript durante las pruebas de funciones", async () => {
    // Con la red cortada el navegador registra fallos de red esperables; se ignoran.
    const reales = errores.filter((e) => !/net::ERR_INTERNET_DISCONNECTED|Failed to fetch|Failed to load resource/.test(e));
    esperar(reales.length === 0, reales.join(" | "));
  });

  await contexto.close();
} finally {
  await navegador.close();
  servidor.close();
}

console.log("");
if (fallos.length) {
  console.error(`✘ ${fallos.length} de ${pruebas} pruebas fallaron.`);
  process.exit(1);
}
console.log(`✔ ${pruebas} pruebas en navegador sin problemas.`);
