// Repositorio del catálogo: decide DE DÓNDE salen los productos.
//
// Estrategia "offline-first" en dos pasos:
//   1. Se lee primero IndexedDB y se pinta al instante (funciona sin red).
//   2. En paralelo se pide data/productos.json; si llega una versión distinta, se
//      guarda en IndexedDB y se avisa para volver a pintar.
// Si es la primera visita y no hay red ni IndexedDB, se lanza un error claro.
//
// Las tres páginas (inicio, catálogo, producto) usan este mismo módulo: así el
// catálogo se descarga una vez y las demás páginas lo leen de IndexedDB.

import * as db from "./db.js";

const URL_CATALOGO = "data/productos.json";

function validarProducto(p) {
  return (
    p &&
    typeof p.id === "string" &&
    typeof p.nombre === "string" &&
    typeof p.marca === "string" &&
    typeof p.franquicia === "string" &&
    typeof p.escala === "string" &&
    typeof p.categoria === "string" &&
    Number.isFinite(p.precio) &&
    Number.isInteger(p.stock)
  );
}

function validarCategoria(c) {
  return c && typeof c.id === "string" && typeof c.nombre === "string" && typeof c.imagen === "string";
}

async function descargarCatalogo() {
  const respuesta = await fetch(URL_CATALOGO, { headers: { Accept: "application/json" } });
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status} al pedir el catálogo`);
  const datos = await respuesta.json();
  if (!Array.isArray(datos?.productos)) throw new Error("El catálogo no tiene el formato esperado.");
  // Se descartan registros mal formados en vez de romper toda la vista.
  return {
    version: String(datos.version ?? ""),
    productos: datos.productos.filter(validarProducto),
    categorias: Array.isArray(datos.categorias) ? datos.categorias.filter(validarCategoria) : [],
  };
}

export async function leerMetaCatalogo() {
  try {
    return (await db.obtener(db.ALMACENES.meta, "catalogo")) ?? null;
  } catch {
    return null;
  }
}

/**
 * Carga el catálogo.
 * @param {(catalogo: {productos: object[], categorias: object[]}, meta: object) => void} alActualizar
 *        se llama si la red trae una versión nueva después de haber pintado la copia local.
 * @returns {Promise<{ productos: object[], categorias: object[], origen: "indexeddb" | "red", meta: object | null }>}
 */
export async function cargarCatalogo(alActualizar) {
  let locales = [];
  try {
    locales = await db.obtenerTodos(db.ALMACENES.productos);
  } catch (error) {
    console.warn("[repo] No se pudo leer IndexedDB:", error);
  }
  const metaLocal = await leerMetaCatalogo();
  // Una copia local de una versión anterior (sin categorías) no sirve para pintar
  // la portada: se trata como si no hubiera copia y se espera a la red.
  const localUsable = locales.length > 0 && Array.isArray(metaLocal?.categorias);

  const sincronizar = descargarCatalogo().then(async ({ version, productos, categorias }) => {
    if (localUsable && metaLocal.version === version && locales.length === productos.length) return null;
    await db.reemplazarCatalogo(productos, version, categorias);
    return { productos, categorias, meta: await leerMetaCatalogo() };
  });

  if (localUsable) {
    // Hay copia local: se devuelve ya y la sincronización sigue en segundo plano.
    sincronizar
      .then((nuevo) => nuevo && alActualizar?.(nuevo, nuevo.meta))
      .catch((error) => console.info("[repo] Sin red: se mantiene el catálogo de IndexedDB.", error.message));
    return { productos: locales, categorias: metaLocal.categorias, origen: "indexeddb", meta: metaLocal };
  }

  // Primera visita (o copia vieja): no hay nada útil local, hay que esperar a la red.
  const nuevo = await sincronizar.catch((error) => {
    if (locales.length > 0) return null; // sin red, pero al menos hay productos
    throw new Error(
      `No hay catálogo guardado y no se pudo descargar (${error.message}). Conéctate a internet una vez para usar la tienda sin conexión.`
    );
  });
  if (nuevo) return { productos: nuevo.productos, categorias: nuevo.categorias, origen: "red", meta: nuevo.meta };
  return { productos: locales, categorias: metaLocal?.categorias ?? [], origen: "indexeddb", meta: metaLocal };
}

// ---- Consultas puras sobre el arreglo de productos (sin efectos secundarios) ----

const normalizar = (texto) =>
  String(texto)
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

// "1/144" -> 144: sirve para ordenar escalas de mayor a menor tamaño de modelo.
const denominador = (escala) => Number(String(escala).split("/")[1]) || 0;

/**
 * Valores posibles de cada filtro con su conteo.
 * @param {object[]} productos
 * @param {object[]} categorias orden y nombres de las categorías (vienen del JSON)
 */
export function facetas(productos, categorias = []) {
  const contar = (campo) => {
    const mapa = new Map();
    productos.forEach((p) => mapa.set(p[campo], (mapa.get(p[campo]) ?? 0) + 1));
    return mapa;
  };
  const ordenAlfabetico = (mapa) =>
    [...mapa].sort(([a], [b]) => a.localeCompare(b, "es")).map(([valor, total]) => ({ valor, total }));
  const porCategoria = contar("categoria");
  return {
    // Las categorías respetan el orden editorial del JSON, no el alfabético.
    categorias: categorias
      .filter((c) => porCategoria.has(c.id))
      .map((c) => ({ valor: c.id, etiqueta: c.nombre, total: porCategoria.get(c.id) })),
    marcas: ordenAlfabetico(contar("marca")),
    franquicias: ordenAlfabetico(contar("franquicia")),
    // Escalas de la más grande (1/24) a la más pequeña (1/550).
    escalas: [...contar("escala")]
      .sort(([a], [b]) => denominador(a) - denominador(b))
      .map(([valor, total]) => ({ valor, total })),
  };
}

export function filtrar(productos, filtros) {
  const texto = normalizar(filtros.texto ?? "").trim();
  const resultado = productos.filter((p) => {
    if (filtros.categorias?.length && !filtros.categorias.includes(p.categoria)) return false;
    if (filtros.marcas?.length && !filtros.marcas.includes(p.marca)) return false;
    if (filtros.franquicias?.length && !filtros.franquicias.includes(p.franquicia)) return false;
    if (filtros.escalas?.length && !filtros.escalas.includes(p.escala)) return false;
    if (!texto) return true;
    const pajar = normalizar([p.nombre, p.marca, p.linea, p.franquicia, p.serie, p.escala].join(" "));
    return texto.split(/\s+/).every((palabra) => pajar.includes(palabra));
  });

  const comparadores = {
    "precio-asc": (a, b) => a.precio - b.precio,
    "precio-desc": (a, b) => b.precio - a.precio,
    nombre: (a, b) => a.nombre.localeCompare(b.nombre, "es"),
    escala: (a, b) => denominador(a.escala) - denominador(b.escala),
    recientes: (a, b) => String(b.ingreso ?? "").localeCompare(String(a.ingreso ?? "")),
  };
  const comparar = comparadores[filtros.orden];
  return comparar ? [...resultado].sort(comparar) : resultado;
}

/** Productos marcados como nuevos, del ingreso más reciente al más antiguo. */
export function novedades(productos, maximo = 6) {
  return productos
    .filter((p) => p.nuevo === true)
    .sort((a, b) => String(b.ingreso ?? "").localeCompare(String(a.ingreso ?? "")))
    .slice(0, maximo);
}

/**
 * Productos relacionados: primero la misma categoría, luego la misma franquicia.
 * Dentro de cada grupo, los de escala más parecida primero.
 */
export function relacionados(producto, productos, maximo = 4) {
  const puntaje = (p) =>
    (p.categoria === producto.categoria ? 2 : 0) + (p.franquicia === producto.franquicia ? 1 : 0);
  const distanciaEscala = (p) => Math.abs(denominador(p.escala) - denominador(producto.escala));
  return productos
    .filter((p) => p.id !== producto.id && puntaje(p) > 0)
    .sort((a, b) => puntaje(b) - puntaje(a) || distanciaEscala(a) - distanciaEscala(b))
    .slice(0, maximo);
}
