// Lógica compartida por las tres páginas (index.html, catalogo.html, producto.html).
//
// Cada página importa este módulo y le pasa sus propios callbacks. Aquí vive todo
// lo que está en el "marco" del sitio: header (menú, carrito, estado de red),
// footer (créditos, borrado de datos), Service Worker e instalación de la PWA.
//
//   comun.js   -> marco + carga del catálogo
//   inicio.js / catalogo.js / producto.js -> contenido propio de cada página

import * as repo from "./repo.js";
import * as db from "./db.js";
import * as view from "./view.js";
import { Carrito } from "./cart.js";
import { borrarDatosContacto } from "./contact.js";
import { CLAVES, COOKIES, cookies, local, sesion } from "./storage.js";

const $ = (selector) => document.querySelector(selector);

export const carrito = new Carrito();

// ======================= Carrito =======================
/** Agrega y anuncia. Devuelve el resultado para que la página decida dónde va el foco. */
export function agregarAlCarrito(id, cantidad = 1) {
  const resultado = carrito.agregar(id, cantidad);
  view.anunciar(resultado.mensaje);
  return resultado;
}

/**
 * Después de re-renderizar una lista de tarjetas, el botón pulsado ya no existe:
 * el foco vuelve al botón nuevo del mismo producto (WCAG 2.4.3). Si quedó
 * deshabilitado (stock agotado), va al título de la tarjeta.
 */
export function enfocarTarjeta(id) {
  const titulo = document.querySelector(`#prod-${CSS.escape(id)}`);
  const boton = titulo?.closest("article")?.querySelector("[data-agregar]");
  if (boton && !boton.disabled) {
    boton.focus();
  } else if (titulo) {
    titulo.tabIndex = -1;
    titulo.focus();
  }
}

export const unidadesEnCarrito = (id) => carrito.lineas().find((l) => l.producto.id === id)?.cantidad ?? 0;

function pintarCarrito(enfocar) {
  view.renderContadorCarrito(carrito.unidades());
  view.renderCarrito(carrito.lineas(), carrito.total(), {
    alCambiar: (id, cantidad, accion) => {
      const { mensaje } = carrito.cambiarCantidad(id, cantidad);
      view.anunciar(mensaje);
      pintarCarrito({ id, accion });
    },
    alQuitar: (id) => {
      view.anunciar(carrito.quitar(id).mensaje);
      pintarCarrito({ id: null });
    },
  });
  if (enfocar) {
    const fila = enfocar.id && document.querySelector(`#lista-carrito [data-id="${CSS.escape(enfocar.id)}"]`);
    let destino = fila?.querySelector(`[data-accion="${enfocar.accion}"]`);
    if (destino?.disabled) destino = fila.querySelector('[data-accion="cantidad"]');
    // Si la fila desapareció, el foco va al primer control útil del diálogo.
    (destino ?? document.querySelector("#lista-carrito button") ?? $("#boton-cerrar-carrito")).focus();
  }
}

function conectarCarrito(alCambiarCarrito) {
  const dialogo = $("#dialogo-carrito");
  const botonAbrir = $("#boton-carrito");

  carrito.addEventListener("cambio", () => {
    // Cubre también cambios hechos en OTRA pestaña (evento "storage" en cart.js).
    if (dialogo.open) pintarCarrito();
    else view.renderContadorCarrito(carrito.unidades());
    alCambiarCarrito?.();
  });

  botonAbrir.addEventListener("click", () => {
    $("#pedido-confirmado").hidden = true;
    pintarCarrito();
    dialogo.showModal();
    $("#boton-cerrar-carrito").focus();
  });
  $("#boton-cerrar-carrito").addEventListener("click", () => dialogo.close());
  // Clic en el fondo (fuera del contenido) cierra, igual que Esc.
  dialogo.addEventListener("click", (evento) => {
    if (evento.target === dialogo) dialogo.close();
  });
  // Al cerrar, el foco vuelve al botón que abrió el diálogo (WCAG 2.4.3).
  dialogo.addEventListener("close", () => botonAbrir.focus());

  $("#boton-vaciar-carrito").addEventListener("click", () => {
    carrito.vaciar();
    pintarCarrito();
    view.anunciar("Carrito vaciado.");
    $("#boton-cerrar-carrito").focus();
  });

  $("#boton-confirmar-pedido").addEventListener("click", async () => {
    try {
      const pedido = await carrito.confirmar();
      pintarCarrito();
      view.mostrarPedidoConfirmado(pedido);
      view.anunciar(`Pedido número ${pedido.id} registrado por ${view.precio(pedido.total)}.`);
      $("#boton-cerrar-carrito").focus();
    } catch (error) {
      view.anunciar(`No se pudo registrar el pedido: ${error.message}`);
    }
  });
}

// ======================= Menú móvil =======================
function conectarMenu() {
  const boton = $("#boton-menu");
  const menu = $("#menu-principal");
  const cerrar = () => {
    boton.setAttribute("aria-expanded", "false");
    menu.classList.add("hidden");
  };
  boton.addEventListener("click", () => {
    const abierto = boton.getAttribute("aria-expanded") === "true";
    boton.setAttribute("aria-expanded", String(!abierto));
    menu.classList.toggle("hidden", abierto);
    if (!abierto) menu.querySelector("a")?.focus();
  });
  menu.addEventListener("click", (evento) => {
    if (evento.target.closest("a") && boton.offsetParent !== null) cerrar();
  });
  menu.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && boton.offsetParent !== null) {
      cerrar();
      boton.focus();
    }
  });
}

// ======================= Borrar datos locales (footer) =======================
function conectarBorrado() {
  const confirmar = $("#confirmar-borrado");
  const botonBorrar = $("#boton-borrar-todo");
  if (!botonBorrar) return;
  // Confirmación en línea en vez de window.confirm(): accesible y con estilo consistente.
  botonBorrar.addEventListener("click", () => {
    confirmar.hidden = false;
    $("#boton-cancelar-borrado").focus();
  });
  $("#boton-cancelar-borrado").addEventListener("click", () => {
    confirmar.hidden = true;
    botonBorrar.focus();
  });
  $("#boton-confirmar-borrado").addEventListener("click", async () => {
    borrarDatosContacto();
    carrito.vaciar();
    local.borrar(CLAVES.recordarContacto);
    sesion.borrar(CLAVES.filtros);
    Object.values(COOKIES).forEach((c) => cookies.borrar(c));
    await Promise.allSettled(Object.values(db.ALMACENES).map((a) => db.vaciar(a)));
    // Se recarga para volver a descargar el catálogo y dejar todo en estado inicial.
    location.reload();
  });
}

// ======================= Red, Service Worker e instalación =======================
function conectarRed(alVolverRed) {
  view.mostrarEstadoRed(navigator.onLine);
  window.addEventListener("online", () => {
    view.mostrarEstadoRed(true);
    alVolverRed();
  });
  window.addEventListener("offline", () => view.mostrarEstadoRed(false));
}

async function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.warn("[comun] Este navegador no soporta Service Workers: no habrá modo offline.");
    return;
  }
  try {
    const registro = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    const avisar = (worker) => {
      $("#aviso-actualizacion").hidden = false;
      $("#boton-actualizar").onclick = () => worker.postMessage({ tipo: "SKIP_WAITING" });
    };
    if (registro.waiting && navigator.serviceWorker.controller) avisar(registro.waiting);
    registro.addEventListener("updatefound", () => {
      const nuevo = registro.installing;
      nuevo?.addEventListener("statechange", () => {
        // Solo es "actualización" si ya había un SW controlando la página.
        if (nuevo.state === "installed" && navigator.serviceWorker.controller) avisar(nuevo);
      });
    });
    let recargando = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (recargando) return;
      recargando = true;
      location.reload();
    });
  } catch (error) {
    console.error("[comun] No se pudo registrar el Service Worker:", error);
  }
}

function conectarInstalacion() {
  let eventoInstalar = null;
  const boton = $("#boton-instalar");
  window.addEventListener("beforeinstallprompt", (evento) => {
    evento.preventDefault();
    eventoInstalar = evento;
    boton.hidden = false;
  });
  boton.addEventListener("click", async () => {
    if (!eventoInstalar) return;
    eventoInstalar.prompt();
    await eventoInstalar.userChoice;
    eventoInstalar = null;
    boton.hidden = true;
  });
  window.addEventListener("appinstalled", () => {
    boton.hidden = true;
    view.anunciar("Hangar Kits se instaló en tu dispositivo.");
  });
}

// ======================= Arranque común =======================
/**
 * Conecta el marco del sitio y carga el catálogo.
 * @param {object} opciones
 * @param {(catalogo: {productos, categorias}, info: {origen, meta, actualizado}) => void} opciones.alCatalogo
 *        se llama con la copia local y otra vez si la red trae una versión nueva.
 * @param {(mensaje: string) => void} opciones.alError  no hay catálogo ni en IndexedDB ni en la red.
 * @param {() => void} [opciones.alCambiarCarrito]  para refrescar "(n en carrito)" en las tarjetas.
 */
export async function iniciarPagina({ alCatalogo, alError, alCambiarCarrito }) {
  // Cookie de última visita: se muestra la anterior y se guarda la actual.
  const nodoVisita = $("#ultima-visita");
  const anterior = cookies.leer(COOKIES.ultimaVisita);
  if (nodoVisita) nodoVisita.textContent = anterior ? view.fecha(anterior) : "esta es tu primera visita";
  cookies.guardar(COOKIES.ultimaVisita, new Date().toISOString());

  const usar = (catalogo, info) => {
    carrito.usarCatalogo(catalogo.productos);
    view.renderCreditos(catalogo.productos);
    alCatalogo(catalogo, info);
  };
  const alActualizar = (catalogo, meta) => {
    usar(catalogo, { origen: "red", meta, actualizado: true });
    view.anunciar("El catálogo se actualizó con la última versión.");
  };

  // Al volver la red se intenta refrescar el catálogo en segundo plano.
  conectarRed(() => repo.cargarCatalogo(alActualizar).catch(() => {}));
  conectarMenu();
  conectarCarrito(alCambiarCarrito);
  conectarBorrado();
  conectarInstalacion();
  view.renderContadorCarrito(carrito.unidades());

  try {
    const { productos, categorias, origen, meta } = await repo.cargarCatalogo(alActualizar);
    usar({ productos, categorias }, { origen, meta, actualizado: false });
  } catch (error) {
    alError(error.message);
  }

  registrarServiceWorker();
}
