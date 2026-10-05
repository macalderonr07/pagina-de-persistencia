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

function crearDiapositiva(p) {
  const contenido = el("article", { clase: "grid h-full overflow-hidden md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]" }, [
    el("img", {
      clase: "aspect-[4/3] h-full w-full object-cover",
      attrs: { src: p.imagen, alt: p.alt ?? `Kit ${p.nombre}`, width: "800", height: "600" },
    }),
    el("div", { clase: "flex flex-col justify-center gap-3 p-6 md:p-10" }, [
      el("p", { clase: "flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-widest text-yellow-400" }, [
        el("span", { clase: "chip bg-yellow-400 text-navy-950", texto: "Nuevo" }),
        el("span", { texto: `Ingresó el ${view.dia(p.ingreso)}` }),
      ]),
      el("h3", { clase: "text-2xl font-extrabold leading-tight md:text-4xl", texto: p.nombre }),
      el("p", { clase: "text-slate-200", texto: `${p.franquicia} · ${p.serie}` }),
      el("p", { clase: "max-w-prose text-slate-200", texto: p.descripcion }),
      el("p", { clase: "flex flex-wrap items-center gap-x-4 gap-y-2" }, [
        el("span", { clase: "text-3xl font-extrabold", texto: view.precio(p.precio) }),
        el("span", { clase: "text-sm text-slate-300", texto: `${p.linea} · Escala ${p.escala}` }),
      ]),
      el("p", { clase: "mt-2" }, [
        // aria-label con el nombre: varios "Ver producto" iguales no se distinguirían (WCAG 2.4.4).
        el("a", { clase: "btn-acento", texto: "Ver producto", attrs: { href: view.urlProducto(p.id), "aria-label": `Ver producto: ${p.nombre}` } }),
      ]),
    ]),
  ]);
  contenido.dataset.titulo = p.nombre;
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
    carrusel = new Carrusel(seccion, nuevos.map(crearDiapositiva));
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
