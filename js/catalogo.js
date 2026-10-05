// Página de catálogo (catalogo.html): filtros, orden, vista y tarjetas.
//
// Filtros: la URL manda. Si se llega desde una barra de categoría de la portada
// (catalogo.html?categoria=high-grade), esos filtros reemplazan a los guardados.
// Si se llega sin parámetros, se restauran los de sessionStorage. Cada cambio se
// guarda en sessionStorage Y se refleja en la URL con history.replaceState, así el
// enlace se puede copiar/compartir y recargar no pierde la búsqueda.

import * as repo from "./repo.js";
import * as view from "./view.js";
import { iniciarPagina, agregarAlCarrito, enfocarTarjeta, unidadesEnCarrito } from "./comun.js";
import { COOKIES, CLAVES, cookies, sesion } from "./storage.js";

const $ = (selector) => document.querySelector(selector);

const CAMPOS_LISTA = ["categorias", "marcas", "franquicias", "escalas"];
// Nombre del parámetro en la URL (singular, más legible) -> campo del estado.
const PARAMETROS = { categoria: "categorias", marca: "marcas", franquicia: "franquicias", escala: "escalas" };
const ORDENES = ["relevancia", "recientes", "precio-asc", "precio-desc", "nombre", "escala"];

const filtrosVacios = () => ({ texto: "", categorias: [], marcas: [], franquicias: [], escalas: [], orden: "relevancia" });

const estado = {
  productos: [],
  categorias: [],
  filtros: leerFiltrosIniciales(),
  vista: cookies.leer(COOKIES.vista) === "lista" ? "lista" : "cuadricula",
};

// ======================= Filtros: URL y sessionStorage =======================
function normalizarFiltros(g) {
  const lista = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  const f = filtrosVacios();
  if (typeof g?.texto === "string") f.texto = g.texto;
  CAMPOS_LISTA.forEach((c) => { f[c] = lista(g?.[c]); });
  if (ORDENES.includes(g?.orden)) f.orden = g.orden;
  return f;
}

function leerFiltrosIniciales() {
  const params = new URLSearchParams(location.search);
  const hayParametros = [...Object.keys(PARAMETROS), "q", "orden"].some((p) => params.has(p));
  if (!hayParametros) return normalizarFiltros(sesion.leer(CLAVES.filtros, null));
  const desdeUrl = { texto: params.get("q") ?? "", orden: params.get("orden") ?? "relevancia" };
  Object.entries(PARAMETROS).forEach(([param, campo]) => { desdeUrl[campo] = params.getAll(param); });
  return normalizarFiltros(desdeUrl);
}

function guardarFiltros() {
  sesion.guardar(CLAVES.filtros, estado.filtros);
  const params = new URLSearchParams();
  Object.entries(PARAMETROS).forEach(([param, campo]) => estado.filtros[campo].forEach((v) => params.append(param, v)));
  if (estado.filtros.texto) params.set("q", estado.filtros.texto);
  if (estado.filtros.orden !== "relevancia") params.set("orden", estado.filtros.orden);
  const consulta = params.toString();
  // replaceState y no pushState: cada tecla no debe crear una entrada en el historial.
  history.replaceState(null, "", consulta ? `?${consulta}` : location.pathname);
}

function leerFiltrosDelFormulario() {
  const form = $("#form-filtros");
  const marcados = (nombre) => [...form.querySelectorAll(`input[name="${nombre}"]:checked`)].map((i) => i.value);
  estado.filtros = {
    texto: form.elements.texto.value.trim(),
    categorias: marcados("categorias"),
    marcas: marcados("marcas"),
    franquicias: marcados("franquicias"),
    escalas: marcados("escalas"),
    orden: form.elements.orden.value,
  };
}

const nombreCategoria = (id) => estado.categorias.find((c) => c.id === id)?.nombre ?? id;

function pintarFormularioFiltros() {
  const f = repo.facetas(estado.productos, estado.categorias);
  view.renderOpcionesFiltro($("#filtro-categorias"), "categorias", f.categorias, estado.filtros.categorias);
  view.renderOpcionesFiltro($("#filtro-marcas"), "marcas", f.marcas, estado.filtros.marcas);
  view.renderOpcionesFiltro($("#filtro-franquicias"), "franquicias", f.franquicias, estado.filtros.franquicias);
  view.renderOpcionesFiltro($("#filtro-escalas"), "escalas", f.escalas, estado.filtros.escalas);
  $("#filtro-texto").value = estado.filtros.texto;
  $("#filtro-orden").value = estado.filtros.orden;
}

/** Título de la página según la categoría elegida: orienta al que llega desde la portada. */
function pintarEncabezado() {
  const { categorias } = estado.filtros;
  const unica = categorias.length === 1 ? estado.categorias.find((c) => c.id === categorias[0]) : null;
  $("#titulo-catalogo").textContent = unica ? unica.nombre : "Catálogo";
  $("#subtitulo-catalogo").textContent = unica ? unica.descripcion ?? "" : "Todos los kits de la tienda.";
  $("#miga-actual").textContent = unica ? unica.nombre : "Catálogo";
  document.title = `${unica ? unica.nombre : "Catálogo"} — Hangar Kits`;
}

function aplicarFiltros({ anunciar = false } = {}) {
  guardarFiltros();
  pintarEncabezado();
  const resultado = repo.filtrar(estado.productos, estado.filtros);
  view.renderProductos($("#lista-productos"), resultado, {
    vista: estado.vista,
    unidadesEnCarrito,
    alAgregar: (id) => {
      agregarAlCarrito(id);
      enfocarTarjeta(id);
    },
  });
  view.renderResumenResultados(resultado.length, estado.productos.length);
  view.renderFiltrosActivos($("#filtros-activos"), estado.filtros, nombreCategoria, quitarFiltro);
  // El resumen ya es aria-live; "anunciar" solo se usa para acciones sin región propia.
  if (anunciar) view.anunciar($("#resumen-resultados").textContent);
}

function quitarFiltro(campo, valor) {
  if (campo === "texto") estado.filtros.texto = "";
  else estado.filtros[campo] = estado.filtros[campo].filter((v) => v !== valor);
  pintarFormularioFiltros();
  aplicarFiltros();
  // El chip pulsado desaparece: el foco va al título del catálogo (no se pierde en <body>).
  $("#titulo-catalogo").focus();
}

function limpiarFiltros() {
  estado.filtros = filtrosVacios();
  pintarFormularioFiltros();
  aplicarFiltros();
}

function conectarFiltros() {
  const form = $("#form-filtros");
  let temporizador;
  form.addEventListener("input", (evento) => {
    if (evento.target.name !== "texto") return;
    clearTimeout(temporizador);
    // Debounce: no re-renderizar en cada tecla.
    temporizador = setTimeout(() => {
      leerFiltrosDelFormulario();
      aplicarFiltros();
    }, 250);
  });
  form.addEventListener("change", (evento) => {
    if (evento.target.name === "texto") return;
    leerFiltrosDelFormulario();
    aplicarFiltros();
  });
  form.addEventListener("submit", (evento) => {
    // Enter en el buscador: aplica al instante y no recarga la página.
    evento.preventDefault();
    clearTimeout(temporizador);
    leerFiltrosDelFormulario();
    aplicarFiltros({ anunciar: true });
  });
  form.addEventListener("reset", (evento) => {
    evento.preventDefault();
    limpiarFiltros();
    view.anunciar("Filtros borrados. " + $("#resumen-resultados").textContent);
  });
  $("#boton-limpiar-vacio").addEventListener("click", () => {
    limpiarFiltros();
    $("#filtro-texto").focus();
  });

  // Panel de filtros plegable en pantallas pequeñas (patrón disclosure).
  const botonFiltros = $("#boton-filtros");
  botonFiltros.addEventListener("click", () => {
    const abierto = botonFiltros.getAttribute("aria-expanded") === "true";
    botonFiltros.setAttribute("aria-expanded", String(!abierto));
    botonFiltros.textContent = abierto ? "Mostrar filtros" : "Ocultar filtros";
    $("#panel-filtros").classList.toggle("hidden", abierto);
    if (!abierto) $("#filtro-texto").focus();
  });

  // Vista cuadrícula / lista: preferencia en cookie.
  document.querySelectorAll('input[name="vista"]').forEach((radio) => {
    radio.checked = radio.value === estado.vista;
    radio.addEventListener("change", () => {
      estado.vista = radio.value;
      cookies.guardar(COOKIES.vista, estado.vista);
      aplicarFiltros();
    });
  });
}

conectarFiltros();

iniciarPagina({
  alCatalogo: ({ productos, categorias }, { origen, meta }) => {
    estado.productos = productos;
    estado.categorias = categorias;
    // Se descartan filtros que ya no existen en el catálogo (p. ej. una URL vieja
    // con ?categoria=inventada): mejor mostrar todo que una lista vacía sin motivo.
    const validas = new Set(categorias.map((c) => c.id));
    estado.filtros.categorias = estado.filtros.categorias.filter((c) => validas.has(c));
    pintarFormularioFiltros();
    aplicarFiltros();
    view.mostrarOrigenCatalogo($("#origen-catalogo"), origen, meta);
  },
  alError: (mensaje) => {
    view.mostrarError($("#error-catalogo"), mensaje);
    $("#resumen-resultados").textContent = "No se pudo cargar el catálogo.";
  },
  alCambiarCarrito: () => {
    if (estado.productos.length) aplicarFiltros();
  },
});
