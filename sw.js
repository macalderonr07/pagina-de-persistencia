// Service Worker de Hangar Kits.
//
// Vive en la RAÍZ del sitio (no en /js/) a propósito: el alcance (scope) de un SW
// es la carpeta donde está el archivo, y debe controlar index.html. Desde /js/ solo
// controlaría URLs bajo /js/.
//
// Estrategias:
//   - Precarga (install): todo el "app shell" + imágenes + JSON. Tras la primera
//     visita, la tienda abre completa sin red.
//   - Navegación (HTML): red primero, con caché de respaldo -> siempre la última
//     versión si hay red, y la copia guardada si no.
//   - data/productos.json: stale-while-revalidate -> responde al instante con la
//     caché y actualiza en segundo plano.
//   - Resto (CSS, JS, imágenes, íconos): caché primero.
//
// Al cambiar cualquier archivo precargado hay que subir VERSION para que los
// clientes descarguen la nueva versión (comun.js muestra el aviso "Actualizar").

const VERSION = "v2.3.0";
const CACHE_APP = `hangar-app-${VERSION}`;
const CACHE_DATOS = `hangar-datos-${VERSION}`;

// Las tres páginas del sitio. Se guardan SIN query string: producto.html?id=x y
// producto.html?id=y son la misma página; el id lo lee producto.js desde la URL.
const PAGINAS = ["./index.html", "./catalogo.html", "./producto.html"];

const PRECARGA = [
  "./",
  ...PAGINAS,
  "./manifest.webmanifest",
  "./assets/styles.css",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./js/comun.js",
  "./js/inicio.js",
  "./js/catalogo.js",
  "./js/producto.js",
  "./js/carrusel.js",
  "./js/repo.js",
  "./js/db.js",
  "./js/view.js",
  "./js/cart.js",
  "./js/contact.js",
  "./js/storage.js",
];
const URL_DATOS = "./data/productos.json";

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    (async () => {
      const app = await caches.open(CACHE_APP);
      // cache: "reload" salta la caché HTTP del navegador: se precarga la versión real del servidor.
      await app.addAll(PRECARGA.map((url) => new Request(url, { cache: "reload" })));
      // Las imágenes (todas las de cada galería) se toman del propio catálogo: agregar un kit al JSON basta para
      // que su foto quede disponible offline, sin mantener una lista a mano aquí.
      const respuesta = await fetch(new Request(URL_DATOS, { cache: "reload" }));
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status} al precargar el catálogo`);
      const datos = await respuesta.clone().json();
      await (await caches.open(CACHE_DATOS)).put(URL_DATOS, respuesta);
      const imagenes = new Set([
        ...(datos.productos ?? []).flatMap((p) => [p.imagen, ...(p.imagenes ?? []).map((i) => i?.src)]),
        ...(datos.categorias ?? []).map((c) => c.imagen),
      ].filter((ruta) => typeof ruta === "string" && ruta.startsWith("assets/img/")));
      await app.addAll([...imagenes].map((ruta) => new Request(`./${ruta}`, { cache: "reload" })));
    })()
  );
  // No se llama a skipWaiting() aquí: la página decide cuándo activar la versión
  // nueva (botón "Actualizar ahora"), para no cambiar archivos a mitad de uso.
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      const vigentes = new Set([CACHE_APP, CACHE_DATOS]);
      const nombres = await caches.keys();
      await Promise.all(
        nombres.filter((n) => n.startsWith("hangar-") && !vigentes.has(n)).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (evento) => {
  if (evento.data?.tipo === "SKIP_WAITING") self.skipWaiting();
});

async function redPrimeroHTML(request) {
  const cache = await caches.open(CACHE_APP);
  // Clave sin query string: "producto.html?id=hg-exia" se guarda como "producto.html".
  const url = new URL(request.url);
  url.search = "";
  const clave = url.pathname.endsWith("/") ? new URL("./index.html", url).href : url.href;
  try {
    const respuesta = await fetch(request);
    if (respuesta.ok) cache.put(clave, respuesta.clone());
    return respuesta;
  } catch {
    // Sin red: la página pedida; si no está (p. ej. una URL desconocida), la portada.
    return (await cache.match(clave)) ?? (await cache.match("./index.html")) ?? Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_DATOS);
  const enCache = await cache.match(request, { ignoreSearch: true });
  const desdeRed = fetch(request)
    .then((respuesta) => {
      if (respuesta.ok) cache.put(request, respuesta.clone());
      return respuesta;
    })
    .catch(() => null);
  return enCache ?? (await desdeRed) ?? new Response(
    JSON.stringify({ error: "sin-conexion" }),
    { status: 503, headers: { "Content-Type": "application/json" } }
  );
}

async function cachePrimero(request) {
  const enCache = await caches.match(request, { ignoreSearch: true });
  if (enCache) return enCache;
  try {
    const respuesta = await fetch(request);
    if (respuesta.ok) (await caches.open(CACHE_APP)).put(request, respuesta.clone());
    return respuesta;
  } catch {
    return Response.error();
  }
}

self.addEventListener("fetch", (evento) => {
  const { request } = evento;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Solo se gestionan recursos propios; enlaces externos (créditos) van directo a la red.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    evento.respondWith(redPrimeroHTML(request));
  } else if (url.pathname.endsWith("/data/productos.json")) {
    evento.respondWith(staleWhileRevalidate(request));
  } else {
    evento.respondWith(cachePrimero(request));
  }
});
