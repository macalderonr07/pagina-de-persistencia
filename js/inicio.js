// Página de inicio (index.html): carrusel de novedades, categorías en barras
// diagonales y formulario de contacto.

import * as repo from "./repo.js";
import * as view from "./view.js";
import { Carrusel } from "./carrusel.js";
import { iniciarPagina } from "./comun.js";
import { iniciarContacto } from "./contact.js";

const $ = (selector) => document.querySelector(selector);
const { el } = view;

let carrusel = null;

// Clases de entrada escalonada: cada bloque de texto sube y aparece un poco
// después del anterior. Solo con motion-safe (respeta "reducir movimiento") y solo
// en la diapositiva activa (group-[.activa]:), así se repite en cada cambio.
const ENTRAR = "motion-safe:group-[.activa]:animate-entrar";

function crearDiapositiva(p, i) {
  const numero = String(i + 1).padStart(2, "0");
  const contenido = el("article", { clase: "relative h-[32rem] overflow-hidden md:h-[30rem]" }, [
    // Foto a pantalla completa con zoom lento (Ken Burns), pausado junto con el carrusel.
    el("img", {
      clase: "absolute inset-0 h-full w-full object-cover motion-safe:group-[.activa]:animate-kenburns group-[.pausado]/carrusel:[animation-play-state:paused]",
      attrs: { src: p.imagen, alt: p.alt ?? `Kit ${p.nombre}`, width: "800", height: "600" },
    }),
    // Degradado: en móvil desde abajo (texto abajo), en escritorio desde la izquierda.
    // Garantiza el contraste AA del texto blanco sobre cualquier foto.
    el("div", {
      clase: "absolute inset-0 bg-gradient-to-t from-navy-950 via-navy-950/85 to-navy-950/10 md:bg-gradient-to-r md:from-navy-950 md:via-navy-950/80 md:to-transparent",
      attrs: { "aria-hidden": "true" },
    }),
    // Franja diagonal amarilla: repite el lenguaje de las barras de categorías.
    el("div", {
      clase: "absolute -right-16 top-0 hidden h-full w-48 -skew-x-12 bg-gradient-to-b from-yellow-400/25 to-yellow-400/0 md:block motion-safe:group-[.activa]:animate-deslizar",
      attrs: { "aria-hidden": "true" },
    }),
    // Número grande decorativo, solo contorno.
    el("span", {
      clase: "pointer-events-none absolute bottom-3 right-5 select-none text-[6rem] font-black leading-none text-transparent [-webkit-text-stroke:2px_rgb(250_204_21_/_0.6)] md:bottom-6 md:right-24 md:text-[9rem] motion-safe:group-[.activa]:animate-deslizar",
      texto: numero,
      attrs: { "aria-hidden": "true" },
    }),
    el("div", { clase: "relative z-10 flex h-full max-w-3xl flex-col justify-end gap-3 p-6 pb-8 md:justify-center md:py-12 md:pl-24 md:pr-0" }, [
      el("p", { clase: `flex flex-wrap items-center gap-3 text-sm font-bold uppercase tracking-widest text-yellow-300 ${ENTRAR} [animation-delay:100ms]` }, [
        // Insignia con "ping": aro que se expande para llamar la atención.
        el("span", { clase: "relative inline-flex" }, [
          el("span", { clase: "absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-60 motion-safe:animate-ping group-[.pausado]/carrusel:[animation-play-state:paused]", attrs: { "aria-hidden": "true" } }),
          el("span", { clase: "relative rounded-full bg-yellow-400 px-3 py-1 text-xs text-navy-950", texto: "Nuevo" }),
        ]),
        el("span", { texto: `Ingresó el ${view.dia(p.ingreso)}` }),
      ]),
      el("h3", { clase: `text-3xl font-black leading-tight drop-shadow-lg md:text-5xl ${ENTRAR} [animation-delay:200ms]`, texto: p.nombre }),
      el("p", { clase: `text-lg text-slate-200 ${ENTRAR} [animation-delay:300ms]`, texto: `${p.franquicia} · ${p.serie}` }),
      el("p", { clase: `hidden max-w-prose text-slate-200 sm:block ${ENTRAR} [animation-delay:400ms]`, texto: p.descripcion }),
      el("p", { clase: `flex flex-wrap gap-2 ${ENTRAR} [animation-delay:450ms]` }, [
        el("span", { clase: "rounded-full bg-white/10 px-3 py-1 text-sm font-semibold ring-1 ring-white/25 backdrop-blur", texto: p.linea }),
        el("span", { clase: "rounded-full bg-white/10 px-3 py-1 text-sm font-semibold ring-1 ring-white/25 backdrop-blur", texto: `Escala ${p.escala}` }),
      ]),
      el("div", { clase: `mt-2 flex flex-wrap items-center gap-x-6 gap-y-3 ${ENTRAR} [animation-delay:550ms]` }, [
        el("p", { clase: "text-4xl font-black text-yellow-300 md:text-5xl", texto: view.precio(p.precio) }),
        // aria-label con el nombre: varios "Ver producto" iguales no se distinguirían (WCAG 2.4.4).
        el("a", {
          clase: "btn-acento relative overflow-hidden px-6 text-lg shadow-lg shadow-yellow-400/20 transition-transform hover:scale-105",
          attrs: { href: view.urlProducto(p.id), "aria-label": `Ver producto: ${p.nombre}` },
        }, [
          el("span", { clase: "relative z-10", texto: "Ver producto" }),
          el("span", { clase: "relative z-10", texto: "→", attrs: { "aria-hidden": "true" } }),
          // Destello que cruza el botón cada pocos segundos.
          el("span", { clase: "absolute inset-y-0 left-0 w-1/3 bg-white/50 motion-safe:animate-brillo group-[.pausado]/carrusel:[animation-play-state:paused]", attrs: { "aria-hidden": "true" } }),
        ]),
      ]),
    ]),
  ]);
  contenido.dataset.titulo = p.nombre;
  contenido.dataset.imagen = p.imagen;
  return contenido;
}

function pintarPortada({ productos, categorias }) {
  const nuevos = repo.novedades(productos);
  const seccion = $("#novedades");
  if (nuevos.length === 0) {
    seccion.hidden = true;
  } else if (!carrusel) {
    // Se crea una sola vez: si el catálogo se actualiza en segundo plano no se
    // reinicia el carrusel bajo los ojos (o el foco) del usuario.
    carrusel = new Carrusel(seccion, nuevos.map((p, i) => crearDiapositiva(p, i)));
  }

  const f = repo.facetas(productos, categorias);
  view.renderCategoriasDiagonales($("#barras-categorias"), categorias, f.categorias);
  $("#dato-kits").textContent = String(productos.length);
  $("#dato-gundam").textContent = String(productos.filter((p) => p.franquicia === "Gundam").length);
  $("#dato-hg").textContent = String(f.categorias.find((c) => c.valor === "high-grade")?.total ?? 0);
}

iniciarContacto({ anunciar: view.anunciar });

iniciarPagina({
  alCatalogo: (catalogo) => pintarPortada(catalogo),
  alError: (mensaje) => {
    $("#novedades").hidden = true;
    view.mostrarError($("#error-catalogo"), mensaje);
  },
});
