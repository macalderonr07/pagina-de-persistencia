// Capa de presentación: solo toca el DOM. No sabe nada de storage ni de red.
// Todos los datos del JSON se insertan con textContent / setAttribute, nunca con
// innerHTML, así un nombre de producto con "<script>" se muestra como texto.

const $ = (selector, raiz = document) => raiz.querySelector(selector);

const formatoMoneda = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });
export const precio = (valor) => formatoMoneda.format(valor);

const formatoFecha = new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short" });
export const fecha = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : formatoFecha.format(d);
};

// "2026-10-03" -> "3 oct 2026". Se arma la fecha en hora local para que no
// retroceda un día por la zona horaria (new Date("2026-10-03") es medianoche UTC).
const formatoDia = new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short", year: "numeric" });
export const dia = (iso) => {
  const [a, m, d] = String(iso).split("-").map(Number);
  return a && m && d ? formatoDia.format(new Date(a, m - 1, d)) : "—";
};

/** URL de la ficha de un producto. encodeURIComponent: el id viene del JSON. */
export const urlProducto = (id) => `producto.html?id=${encodeURIComponent(id)}`;
export const urlCategoria = (id) => `catalogo.html?categoria=${encodeURIComponent(id)}`;

/**
 * Fotos de un producto. La primera es la principal (la de las tarjetas).
 * Si el producto no trae "imagenes" (catálogo viejo en IndexedDB), se arma
 * una galería de una sola foto con los campos de siempre.
 */
export function imagenesDe(p) {
  const validas = Array.isArray(p.imagenes)
    ? p.imagenes.filter((i) => typeof i?.src === "string" && i.credito)
    : [];
  return validas.length ? validas : [{ src: p.imagen, alt: p.alt, credito: p.credito }];
}

export function el(etiqueta, { clase, texto, attrs } = {}, hijos = []) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  Object.entries(attrs ?? {}).forEach(([k, v]) => nodo.setAttribute(k, v));
  hijos.forEach((h) => nodo.append(h));
  return nodo;
}

// ---------- Anuncios para lectores de pantalla ----------
let temporizadorAnuncio;
export function anunciar(mensaje) {
  const region = $("#anuncios");
  // Vaciar y reescribir un instante después fuerza a que se lea aunque el texto se repita.
  region.textContent = "";
  clearTimeout(temporizadorAnuncio);
  temporizadorAnuncio = setTimeout(() => {
    region.textContent = mensaje;
  }, 50);
}

// ---------- Estado de red ----------
export function mostrarEstadoRed(enLinea) {
  const caja = $("#estado-red");
  const texto = $("#estado-red-texto");
  caja.classList.toggle("bg-yellow-400", !enLinea);
  texto.classList.toggle("text-slate-200", enLinea);
  texto.classList.toggle("text-navy-950", !enLinea);
  texto.classList.toggle("font-semibold", !enLinea);
  // Texto + icono, no solo color (WCAG 1.4.1).
  texto.textContent = enLinea
    ? "● En línea: el catálogo se sincroniza automáticamente."
    : "▲ Sin conexión: estás usando el catálogo guardado en tu dispositivo. Carrito, pedidos y mensajes siguen funcionando.";
}

export function mostrarOrigenCatalogo(nodo, origen, meta) {
  if (!nodo) return;
  const nombres = { red: "descargado de la red", indexeddb: "cargado desde IndexedDB (copia local)" };
  const sincronizado = meta?.sincronizado ? ` · última sincronización: ${fecha(meta.sincronizado)}` : "";
  nodo.textContent = `Catálogo ${nombres[origen] ?? origen}${sincronizado}.`;
}

// ---------- Portada: categorías en barras diagonales ----------
// Valida "foco" (punto focal de la foto) antes de usarlo en el estilo: viene del
// JSON y solo se aceptan porcentajes, p. ej. "45% 40%".
const FOCO_VALIDO = /^\d{1,3}% \d{1,3}%$/;

function imagenCategoria(c) {
  // alt="": la imagen es decorativa; el nombre del enlace lo da el texto.
  const img = el("img", { clase: "barra-img", attrs: { src: c.imagen, alt: "", width: "800", height: "600", loading: "lazy", decoding: "async" } });
  // La barra solo deja ver una franja de la foto: object-position centra el kit en ella.
  if (FOCO_VALIDO.test(c.foco ?? "")) img.style.objectPosition = c.foco;
  return img;
}

/**
 * Cada categoría es un ENLACE real a catalogo.html?categoria=…: funciona con
 * teclado, con clic central (pestaña nueva) y aunque falle el JavaScript de la
 * página de destino. La inclinación es solo visual (CSS); el orden de lectura
 * y de tabulación sigue siendo el del DOM.
 */
export function renderCategoriasDiagonales(contenedor, categorias, facetasCategorias) {
  const totales = new Map(facetasCategorias.map((f) => [f.valor, f.total]));
  contenedor.replaceChildren(
    ...categorias
      .filter((c) => totales.has(c.id))
      .map((c) => {
        const total = totales.get(c.id);
        return el("li", { clase: "barra" }, [
          el("a", { clase: "barra-enlace", attrs: { href: urlCategoria(c.id) } }, [
            // alt="": la imagen es decorativa; el nombre del enlace lo da el texto.
            imagenCategoria(c),
            el("span", { clase: "barra-texto" }, [
              el("span", { clase: "barra-subtitulo", texto: c.subtitulo ?? "" }),
              el("span", { clase: "barra-nombre", texto: c.nombre }),
              el("span", { clase: "barra-descripcion", texto: c.descripcion ?? "" }),
              el("span", { clase: "barra-total", texto: `${total} ${total === 1 ? "kit" : "kits"} →` }),
            ]),
          ]),
        ]);
      })
  );
}

// ---------- Filtros ----------
export function renderOpcionesFiltro(contenedor, nombre, opciones, seleccionados) {
  contenedor.replaceChildren(
    ...opciones.map(({ valor, etiqueta, total }, i) => {
      const id = `f-${nombre}-${i}`;
      const input = el("input", {
        clase: "h-5 w-5 accent-blue-700",
        attrs: { type: "checkbox", id, name: nombre, value: valor },
      });
      input.checked = seleccionados.includes(valor);
      return el("label", { clase: "flex min-h-tap cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-slate-100", attrs: { for: id } }, [
        input,
        el("span", { clase: "flex-1", texto: etiqueta ?? valor }),
        el("span", { clase: "text-sm text-slate-600", texto: `(${total})` }),
      ]);
    })
  );
}

export function renderFiltrosActivos(contenedor, filtros, nombreCategoria, alQuitar) {
  const activos = [
    ...(filtros.texto ? [{ campo: "texto", valor: filtros.texto, etiqueta: `Texto: “${filtros.texto}”` }] : []),
    ...filtros.categorias.map((v) => ({ campo: "categorias", valor: v, etiqueta: `Categoría: ${nombreCategoria(v)}` })),
    ...filtros.marcas.map((v) => ({ campo: "marcas", valor: v, etiqueta: `Marca: ${v}` })),
    ...filtros.franquicias.map((v) => ({ campo: "franquicias", valor: v, etiqueta: `Franquicia: ${v}` })),
    ...filtros.escalas.map((v) => ({ campo: "escalas", valor: v, etiqueta: `Escala: ${v}` })),
  ];
  contenedor.replaceChildren(
    ...activos.map(({ campo, valor, etiqueta }) => {
      const boton = el("button", {
        clase: "inline-flex min-h-tap items-center gap-2 rounded-full border-2 border-blue-700 bg-blue-50 px-3 text-sm font-semibold text-blue-900 hover:bg-blue-100",
        attrs: { type: "button", "aria-label": `Quitar filtro ${etiqueta}` },
      }, [el("span", { texto: etiqueta }), el("span", { texto: "✕", attrs: { "aria-hidden": "true" } })]);
      boton.addEventListener("click", () => alQuitar(campo, valor));
      return el("li", {}, [boton]);
    })
  );
}

// ---------- Productos ----------
export function etiquetaStock(stock) {
  if (stock === 0) return "Agotado";
  if (stock <= 3) return `¡Últimas ${stock}!`;
  return `${stock} disponibles`;
}

/**
 * Pinta tarjetas de producto clonando <template id="tpl-producto">.
 * @param {HTMLElement} lista  <ul> destino (catálogo o "relacionados" en la ficha)
 */
export function renderProductos(lista, productos, { vista = "cuadricula", unidadesEnCarrito, alAgregar, columnas }) {
  const plantilla = $("#tpl-producto");
  const enLista = vista === "lista";

  // Grid de CSS: la vista cuadrícula usa columnas responsivas; la vista lista, una
  // sola columna con la tarjeta en dos columnas internas (imagen | datos).
  lista.className = enLista ? "mt-6 grid gap-4" : `mt-6 grid gap-6 ${columnas ?? "sm:grid-cols-2 xl:grid-cols-3"}`;

  lista.replaceChildren(
    ...productos.map((p) => {
      const nodo = plantilla.content.cloneNode(true);
      const articulo = $("[data-contenedor]", nodo);
      const img = $("[data-img]", nodo);
      // En móvil la tarjeta sigue apilada (flex-col); desde sm pasa a grid de 2 columnas.
      // En esa vista la celda de la foto se estira al alto del texto: la figura pasa a
      // columna flex y la imagen ocupa todo el alto libre (sin 4:3 fijo) con
      // object-cover, para que no quede un hueco gris bajo la foto.
      if (enLista) {
        articulo.classList.add("sm:grid", "sm:grid-cols-[14rem_minmax(0,1fr)]");
        $("[data-figura]", nodo).classList.add("sm:flex", "sm:flex-col");
        img.classList.add("sm:aspect-auto", "sm:min-h-0", "sm:flex-1");
      }
      img.src = p.imagen;
      img.alt = p.alt ?? `Kit ${p.nombre}`;
      $("[data-escala]", nodo).textContent = `Escala ${p.escala}`;
      const insignia = $("[data-nuevo]", nodo);
      if (insignia) insignia.hidden = p.nuevo !== true;
      $("[data-credito]", nodo).textContent = p.credito ? `Foto: ${p.credito.autor} (${p.credito.licencia})` : "";
      $("[data-marca]", nodo).textContent = p.marca;
      const titulo = $("[data-nombre]", nodo);
      titulo.id = `prod-${p.id}`;
      const enlace = $("[data-enlace]", nodo);
      enlace.textContent = p.nombre;
      enlace.href = urlProducto(p.id);
      articulo.setAttribute("aria-labelledby", titulo.id);
      $("[data-franquicia]", nodo).textContent = `${p.franquicia} · ${p.serie}`;
      $("[data-descripcion]", nodo).textContent = p.descripcion;
      $("[data-linea]", nodo).textContent = p.linea;
      $("[data-dificultad]", nodo).textContent = p.dificultad;
      const stock = $("[data-stock]", nodo);
      stock.textContent = etiquetaStock(p.stock);
      if (p.stock > 0 && p.stock <= 3) stock.classList.add("text-red-800");
      $("[data-precio]", nodo).textContent = precio(p.precio);

      const boton = $("[data-agregar]", nodo);
      const enCarrito = unidadesEnCarrito(p.id);
      boton.textContent = enCarrito > 0 ? `Agregar (${enCarrito} en carrito)` : "Agregar al carrito";
      // El nombre accesible incluye el producto: "Agregar al carrito" repetido 29 veces
      // no ayuda a quien navega por lista de botones (WCAG 2.4.6 / 2.5.3: el texto visible
      // está contenido al inicio del nombre accesible).
      boton.setAttribute("aria-label", `${boton.textContent}: ${p.nombre}`);
      boton.disabled = p.stock === 0 || enCarrito >= p.stock;
      boton.addEventListener("click", () => alAgregar(p.id));
      return nodo;
    })
  );
}

export function renderResumenResultados(mostrados, total) {
  $("#resumen-resultados").textContent =
    mostrados === total
      ? `${total} kits en el catálogo`
      : `${mostrados} de ${total} kits coinciden con tu búsqueda`;
  $("#sin-resultados").hidden = mostrados !== 0;
}

export function mostrarError(nodo, mensaje) {
  nodo.textContent = mensaje;
  nodo.hidden = false;
}

// ---------- Carrito ----------
export function renderContadorCarrito(unidades) {
  $("#contador-carrito").textContent = String(unidades);
  $("#contador-carrito-texto").textContent = `, ${unidades} ${unidades === 1 ? "unidad" : "unidades"}`;
}

export function renderCarrito(lineas, total, { alCambiar, alQuitar }) {
  $("#carrito-vacio").hidden = lineas.length > 0;
  $("#carrito-total").textContent = precio(total);
  $("#boton-confirmar-pedido").disabled = lineas.length === 0;
  $("#boton-vaciar-carrito").disabled = lineas.length === 0;

  $("#lista-carrito").replaceChildren(
    ...lineas.map(({ producto: p, cantidad, subtotal }) => {
      const idCantidad = `cant-${p.id}`;
      const menos = el("button", { clase: "btn-icono", texto: "−", attrs: { type: "button", "data-accion": "menos", "aria-label": `Quitar una unidad de ${p.nombre}` } });
      const mas = el("button", { clase: "btn-icono", texto: "+", attrs: { type: "button", "data-accion": "mas", "aria-label": `Añadir una unidad de ${p.nombre}` } });
      const input = el("input", {
        clase: "campo mt-0 w-16 text-center",
        attrs: { type: "number", id: idCantidad, "data-accion": "cantidad", min: "1", max: String(p.stock), inputmode: "numeric", value: String(cantidad) },
      });
      if (cantidad >= p.stock) mas.disabled = true;
      menos.addEventListener("click", () => alCambiar(p.id, cantidad - 1, "menos"));
      mas.addEventListener("click", () => alCambiar(p.id, cantidad + 1, "mas"));
      input.addEventListener("change", () => alCambiar(p.id, Number.parseInt(input.value, 10), "cantidad"));
      const quitar = el("button", { clase: "text-sm font-semibold text-red-800 underline underline-offset-2 min-h-tap px-1", texto: "Quitar", attrs: { type: "button", "aria-label": `Quitar ${p.nombre} del carrito` } });
      quitar.addEventListener("click", () => alQuitar(p.id));

      return el("li", { clase: "grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 py-4", attrs: { "data-id": p.id } }, [
        el("img", { clase: "h-[3.375rem] w-[4.5rem] rounded-md object-cover", attrs: { src: p.imagen, alt: "", width: "72", height: "54" } }),
        el("div", {}, [
          el("a", { clase: "font-semibold leading-snug underline-offset-2 hover:underline", texto: p.nombre, attrs: { href: urlProducto(p.id) } }),
          el("p", { clase: "text-sm text-slate-600", texto: `${precio(p.precio)} c/u · Escala ${p.escala}` }),
          el("div", { clase: "mt-2 flex flex-wrap items-center gap-2" }, [
            el("label", { clase: "sr-only", texto: `Cantidad de ${p.nombre}`, attrs: { for: idCantidad } }),
            menos, input, mas, quitar,
          ]),
          el("p", { clase: "mt-1 text-sm font-semibold", texto: `Subtotal: ${precio(subtotal)}` }),
        ]),
      ]);
    })
  );
}

export function mostrarPedidoConfirmado(pedido) {
  const caja = $("#pedido-confirmado");
  caja.replaceChildren(
    el("p", { clase: "font-bold", texto: `Pedido #${pedido.id} registrado por ${precio(pedido.total)}.` }),
    el("p", {
      clase: "text-sm",
      texto: pedido.enLinea
        ? "Quedó guardado en IndexedDB. (Demo: no hay servidor de pagos.)"
        : "Lo hiciste sin conexión: quedó guardado en IndexedDB de tu dispositivo.",
    })
  );
  caja.hidden = false;
}

// ---------- Créditos ----------
export function renderCreditos(productos) {
  const lista = $("#lista-creditos");
  if (!lista) return;
  lista.replaceChildren(
    ...productos.map((p) => {
      const fotos = imagenesDe(p);
      return el("li", {}, [
        el("span", { clase: "font-semibold text-white", texto: p.nombre }),
        el("ul", { clase: "ml-4 list-disc", attrs: { role: "list" } }, fotos.map((foto, i) =>
          el("li", {}, [
            el("span", { texto: `Foto ${i + 1}: ${foto.credito.autor}, ${foto.credito.licencia}. ` }),
            el("a", {
              clase: "text-yellow-300 underline underline-offset-2",
              texto: "Ver original",
              attrs: { href: foto.credito.fuente, rel: "noopener noreferrer", target: "_blank", "aria-label": `Ver original de la foto ${i + 1} de ${p.nombre} (abre en pestaña nueva)` },
            }),
          ])
        )),
      ]);
    })
  );
}
