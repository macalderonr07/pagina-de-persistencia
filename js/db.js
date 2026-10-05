// Envoltorio mínimo de IndexedDB con Promesas.
//
// IndexedDB guarda el catálogo completo (objetos estructurados, con índices por marca,
// franquicia y escala), los pedidos confirmados y la bandeja de salida de mensajes.
// Se eligió IndexedDB para esto y no localStorage porque es asíncrono (no bloquea el
// hilo principal), admite mucho más espacio y permite consultas por índice.

const DB_NOMBRE = "HangarKitsDB";
const DB_VERSION = 1;

export const ALMACENES = Object.freeze({
  productos: "productos",
  meta: "meta",
  pedidos: "pedidos",
  bandeja: "bandeja",
});

let conexion = null;

function promesa(request) {
  return new Promise((resolver, rechazar) => {
    request.onsuccess = () => resolver(request.result);
    request.onerror = () => rechazar(request.error);
  });
}

export function abrir() {
  if (conexion) return conexion;
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("Este navegador no soporta IndexedDB."));
  }
  conexion = new Promise((resolver, rechazar) => {
    const req = indexedDB.open(DB_NOMBRE, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ALMACENES.productos)) {
        const productos = db.createObjectStore(ALMACENES.productos, { keyPath: "id" });
        productos.createIndex("marca", "marca");
        productos.createIndex("franquicia", "franquicia");
        productos.createIndex("escala", "escala");
      }
      if (!db.objectStoreNames.contains(ALMACENES.meta)) {
        db.createObjectStore(ALMACENES.meta, { keyPath: "clave" });
      }
      if (!db.objectStoreNames.contains(ALMACENES.pedidos)) {
        db.createObjectStore(ALMACENES.pedidos, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(ALMACENES.bandeja)) {
        const bandeja = db.createObjectStore(ALMACENES.bandeja, { keyPath: "id", autoIncrement: true });
        bandeja.createIndex("estado", "estado");
      }
    };
    req.onsuccess = () => resolver(req.result);
    req.onerror = () => {
      conexion = null;
      rechazar(req.error);
    };
    req.onblocked = () => rechazar(new Error("IndexedDB bloqueada por otra pestaña abierta."));
  });
  return conexion;
}

async function transaccion(almacen, modo, operacion) {
  const db = await abrir();
  return new Promise((resolver, rechazar) => {
    const tx = db.transaction(almacen, modo);
    const store = tx.objectStore(almacen);
    let resultado;
    Promise.resolve(operacion(store))
      .then((valor) => {
        resultado = valor;
      })
      .catch(rechazar);
    tx.oncomplete = () => resolver(resultado);
    tx.onerror = () => rechazar(tx.error);
    tx.onabort = () => rechazar(tx.error ?? new Error("Transacción abortada."));
  });
}

export function obtenerTodos(almacen) {
  return transaccion(almacen, "readonly", (store) => promesa(store.getAll()));
}

export function obtener(almacen, clave) {
  return transaccion(almacen, "readonly", (store) => promesa(store.get(clave)));
}

export function contar(almacen) {
  return transaccion(almacen, "readonly", (store) => promesa(store.count()));
}

export function poner(almacen, valor) {
  return transaccion(almacen, "readwrite", (store) => promesa(store.put(valor)));
}

export function agregar(almacen, valor) {
  return transaccion(almacen, "readwrite", (store) => promesa(store.add(valor)));
}

export function vaciar(almacen) {
  return transaccion(almacen, "readwrite", (store) => promesa(store.clear()));
}

// Reemplaza el catálogo completo en UNA transacción: o se guarda todo, o nada.
// Así nunca queda un catálogo a medias si se corta la red o se cierra la pestaña.
// Las categorías (7 registros pequeños) viajan dentro del registro "meta": no
// necesitan almacén propio ni índices.
export async function reemplazarCatalogo(productos, version, categorias = []) {
  const db = await abrir();
  return new Promise((resolver, rechazar) => {
    const tx = db.transaction([ALMACENES.productos, ALMACENES.meta], "readwrite");
    const store = tx.objectStore(ALMACENES.productos);
    store.clear();
    productos.forEach((producto) => store.put(producto));
    tx.objectStore(ALMACENES.meta).put({
      clave: "catalogo",
      version,
      sincronizado: new Date().toISOString(),
      total: productos.length,
      categorias,
    });
    tx.oncomplete = () => resolver();
    tx.onerror = () => rechazar(tx.error);
    tx.onabort = () => rechazar(tx.error ?? new Error("Transacción abortada."));
  });
}
