// Ficha de producto (producto.html?id=…).
//
// El id llega por la URL y se busca en el catálogo de IndexedDB, así la ficha
// también abre sin conexión. Nunca se usa el id para armar HTML: solo para
// comparar con los ids del catálogo (un id inventado muestra "no encontrado").

import * as repo from "./repo.js";
import * as view from "./view.js";
import { iniciarPagina, agregarAlCarrito, enfocarTarjeta, unidadesEnCarrito } from "./comun.js";

const $ = (selector) => document.querySelector(selector);

const idBuscado = new URLSearchParams(location.search).get("id") ?? "";
let producto = null;
let catalogo = { productos: [], categorias: [] };

function pintarFicha() {
  const p = producto;
  const categoria = catalogo.categorias.find((c) => c.id === p.categoria);
  document.title = `${p.nombre} — Hangar Kits`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", p.descripcion);

  // Migas de pan: Inicio › Categoría › Producto
  const miga = $("#miga-categoria");
  miga.textContent = categoria?.nombre ?? "Catálogo";
  miga.href = categoria ? view.urlCategoria(categoria.id) : "catalogo.html";
  $("#miga-actual").textContent = p.nombre;

  const img = $("#ficha-img");
  img.src = p.imagen;
  img.alt = p.alt ?? `Kit ${p.nombre}`;
  $("#ficha-credito").replaceChildren(
    `Foto: ${p.credito.autor} (${p.credito.licencia}) · `,
    view.el("a", {
      clase: "underline underline-offset-2",
      texto: "ver original",
      attrs: { href: p.credito.fuente, rel: "noopener noreferrer", target: "_blank", "aria-label": "Ver foto original (abre en pestaña nueva)" },
    })
  );
  $("#ficha-nuevo").hidden = p.nuevo !== true;
  $("#ficha-nuevo").textContent = p.nuevo ? `Nuevo · ingresó el ${view.dia(p.ingreso)}` : "";
  $("#ficha-marca").textContent = `${p.marca} · ${p.linea}`;
  $("#ficha-nombre").textContent = p.nombre;
  $("#ficha-franquicia").textContent = `${p.franquicia} · ${p.serie}`;
  $("#ficha-descripcion").textContent = p.descripcion;
  $("#ficha-precio").textContent = view.precio(p.precio);

  const especificaciones = [
    ["Marca", p.marca],
    ["Línea", p.linea],
    ["Categoría", categoria?.nombre ?? "—"],
    ["Franquicia", p.franquicia],
    ["Serie", p.serie],
    ["Escala", p.escala],
    ["Dificultad", p.dificultad],
    ["Código", p.id],
  ];
  $("#ficha-especificaciones").replaceChildren(
    ...especificaciones.flatMap(([dt, dd]) => [
      view.el("dt", { clase: "font-semibold text-slate-600", texto: dt }),
      view.el("dd", { clase: "text-slate-900", texto: dd }),
    ])
  );
  pintarCompra();
  pintarRelacionados();
  $("#ficha").hidden = false;
}

/** Stock, cantidad y botón: depende del carrito, se repinta cuando este cambia. */
function pintarCompra() {
  const p = producto;
  const enCarrito = unidadesEnCarrito(p.id);
  const disponible = Math.max(0, p.stock - enCarrito);
  const stock = $("#ficha-stock");
  stock.textContent = view.etiquetaStock(p.stock) + (enCarrito ? ` · ${enCarrito} en tu carrito` : "");
  stock.classList.toggle("text-red-800", p.stock > 0 && p.stock <= 3);

  const cantidad = $("#ficha-cantidad");
  const boton = $("#ficha-agregar");
  cantidad.max = String(Math.max(1, disponible));
  if (Number(cantidad.value) > disponible) cantidad.value = String(Math.max(1, disponible));
  cantidad.disabled = disponible === 0;
  boton.disabled = disponible === 0;
  boton.textContent = p.stock === 0 ? "Agotado" : disponible === 0 ? "Ya tienes todo el stock" : "Agregar al carrito";
}

function pintarRelacionados() {
  const relacionados = repo.relacionados(producto, catalogo.productos);
  $("#relacionados").hidden = relacionados.length === 0;
  view.renderProductos($("#lista-relacionados"), relacionados, {
    columnas: "sm:grid-cols-2 lg:grid-cols-4",
    unidadesEnCarrito,
    alAgregar: (id) => {
      agregarAlCarrito(id);
      enfocarTarjeta(id);
    },
  });
}

function conectarCompra() {
  const cantidad = $("#ficha-cantidad");
  $("#form-compra").addEventListener("submit", (evento) => {
    evento.preventDefault();
    const n = Number.parseInt(cantidad.value, 10);
    const maximo = Number(cantidad.max);
    const error = $("#ficha-cantidad-error");
    if (!Number.isInteger(n) || n < 1 || n > maximo) {
      cantidad.setAttribute("aria-invalid", "true");
      error.textContent = `⚠ Elige una cantidad entre 1 y ${maximo}.`;
      error.hidden = false;
      cantidad.focus();
      return;
    }
    cantidad.removeAttribute("aria-invalid");
    error.hidden = true;
    const { ok } = agregarAlCarrito(producto.id, n);
    if (ok) cantidad.value = "1";
    // El botón puede haber quedado deshabilitado (todo el stock en el carrito):
    // en ese caso el foco va al estado de stock, que explica por qué.
    const boton = $("#ficha-agregar");
    if (boton.disabled) $("#ficha-stock").focus();
    else boton.focus();
  });
}

function mostrarNoEncontrado() {
  document.title = "Producto no encontrado — Hangar Kits";
  $("#miga-actual").textContent = "No encontrado";
  $("#no-encontrado").hidden = false;
  $("#ficha").hidden = true;
}

conectarCompra();

iniciarPagina({
  alCatalogo: (nuevo) => {
    catalogo = nuevo;
    producto = catalogo.productos.find((p) => p.id === idBuscado) ?? null;
    if (!producto) return mostrarNoEncontrado();
    $("#no-encontrado").hidden = true;
    pintarFicha();
  },
  alError: (mensaje) => view.mostrarError($("#error-catalogo"), mensaje),
  alCambiarCarrito: () => {
    if (!producto) return;
    pintarCompra();
    // Las tarjetas muestran "(n en carrito)"; el foco lo devuelve alAgregar.
    pintarRelacionados();
  },
});
