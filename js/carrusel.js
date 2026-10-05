// Carrusel accesible de novedades (patrón "Carousel" de las WAI-ARIA APG).
//
// Cómo rota: cada miniatura del selector tiene una barra de progreso animada con
// Tailwind (animate-progreso, 6 s). Cuando la barra de la diapositiva activa
// termina (evento animationend), se pasa a la siguiente. Por eso pausar es solo
// poner la clase "pausado" en la raíz: Tailwind aplica animation-play-state:paused
// a la barra (y al zoom de la foto) y la rotación se detiene exactamente ahí; al
// reanudar sigue desde el mismo punto. No hay setInterval que sincronizar.
//
// Decisiones de accesibilidad:
//   - WCAG 2.2.2 (Pausar, detener, ocultar): botón Pausar/Reanudar, PRIMERO en el
//     orden de tabulación del carrusel.
//   - Si el foco del teclado entra al carrusel, la rotación se detiene y no vuelve
//     a arrancar sola (APG). El ratón encima solo pausa mientras está encima.
//   - prefers-reduced-motion: arranca pausado; el zoom y las entradas de texto
//     usan motion-safe: y no se animan.
//   - Mientras rota, aria-live="off" (no anunciar cada 6 s); en pausa, "polite".
//   - Las diapositivas ocultas llevan `inert`: sin foco ni lectura.
//   - La miniatura activa se marca con aria-current y con borde + opacidad + barra,
//     no solo con color (WCAG 1.4.1).

export class Carrusel {
  #raiz;
  #pista;
  #diapositivas = [];
  #puntos = [];
  #botonPausa;
  #actual = 0;
  #pausadoPorUsuario;
  #pausadoTemporal = false;

  /**
   * @param {HTMLElement} raiz  <section> del carrusel (con los controles ya en el HTML)
   * @param {HTMLElement[]} diapositivas  contenido de cada diapositiva
   *        (dataset.titulo y dataset.imagen alimentan las miniaturas)
   */
  constructor(raiz, diapositivas) {
    this.#raiz = raiz;
    this.#pista = raiz.querySelector("[data-pista]");
    this.#botonPausa = raiz.querySelector("[data-pausa]");
    this.#pausadoPorUsuario = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const total = diapositivas.length;
    this.#diapositivas = diapositivas.map((contenido, i) => {
      const d = document.createElement("div");
      // "group": los hijos usan group-[.activa]: para animarse solo cuando esta
      // diapositiva es la visible (y reiniciar la animación cada vez que vuelve).
      d.className = "carrusel-diapositiva group";
      d.setAttribute("role", "group");
      d.setAttribute("aria-roledescription", "diapositiva");
      d.setAttribute("aria-label", `${i + 1} de ${total}`);
      d.id = `diapositiva-${i}`;
      d.append(contenido);
      return d;
    });
    this.#pista.replaceChildren(...this.#diapositivas);

    const selector = raiz.querySelector("[data-puntos]");
    this.#puntos = diapositivas.map((contenido, i) => this.#crearPunto(contenido, i, total));
    selector.replaceChildren(...this.#puntos);
    // Columnas del selector = número de novedades (en escritorio se ven miniaturas).
    selector.style.gridTemplateColumns = `repeat(${total}, minmax(0, 1fr))`;

    // Fin de la barra de progreso de la diapositiva activa => siguiente.
    selector.addEventListener("animationend", (evento) => {
      if (evento.animationName === "progreso") this.ir(this.#actual + 1);
    });

    raiz.querySelector("[data-anterior]").addEventListener("click", () => this.ir(this.#actual - 1));
    raiz.querySelector("[data-siguiente]").addEventListener("click", () => this.ir(this.#actual + 1));
    this.#botonPausa.addEventListener("click", () => {
      this.#pausadoPorUsuario = !this.#pausadoPorUsuario;
      this.#actualizarPausa();
    });

    // El foco detiene la rotación de forma definitiva (hasta pulsar "Reanudar"),
    // salvo que el foco esté en el propio botón de pausa.
    raiz.addEventListener("focusin", (evento) => {
      if (evento.target !== this.#botonPausa && !this.#pausadoPorUsuario) {
        this.#pausadoPorUsuario = true;
        this.#actualizarPausa();
      }
    });
    raiz.addEventListener("mouseenter", () => {
      this.#pausadoTemporal = true;
      this.#actualizarPausa();
    });
    raiz.addEventListener("mouseleave", () => {
      this.#pausadoTemporal = false;
      this.#actualizarPausa();
    });
    // Pestaña en segundo plano: no avanzar sin que nadie mire.
    document.addEventListener("visibilitychange", () => this.#actualizarPausa());

    if (total < 2) {
      raiz.querySelectorAll("[data-anterior], [data-siguiente], [data-pausa], [data-puntos]").forEach((n) => (n.hidden = true));
    }
    this.#mostrar(0);
    this.#actualizarPausa();
  }

  #crearPunto(contenido, i, total) {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className =
      "group/punto flex min-h-tap flex-col justify-end gap-2 rounded-xl p-1 text-left transition-colors hover:bg-white/5 md:p-2";
    boton.setAttribute("aria-controls", `diapositiva-${i}`);
    boton.setAttribute("aria-label", `Novedad ${i + 1} de ${total}: ${contenido.dataset.titulo ?? ""}`);

    const miniatura = document.createElement("img");
    miniatura.src = contenido.dataset.imagen ?? "";
    miniatura.alt = ""; // el nombre lo da el aria-label del botón
    miniatura.width = 160;
    miniatura.height = 120;
    miniatura.loading = "lazy";
    miniatura.className =
      "hidden aspect-[4/3] w-full rounded-lg object-cover opacity-50 ring-2 ring-transparent transition duration-300 group-hover/punto:opacity-90 group-aria-[current=true]/punto:opacity-100 group-aria-[current=true]/punto:ring-yellow-400 md:block";

    const nombre = document.createElement("span");
    nombre.textContent = contenido.dataset.titulo ?? "";
    nombre.className =
      "hidden text-xs font-semibold leading-tight text-slate-300 group-aria-[current=true]/punto:text-white md:line-clamp-2";

    // Pista + relleno. El relleno escala de 0 a 1 en X (origin-left) durante 6 s.
    const pista = document.createElement("span");
    pista.className = "relative block h-1.5 w-full overflow-hidden rounded-full bg-white/20";
    const relleno = document.createElement("span");
    relleno.dataset.progreso = "";
    relleno.className =
      "absolute inset-0 origin-left scale-x-0 rounded-full bg-yellow-400 group-[.pausado]/carrusel:[animation-play-state:paused]";
    pista.append(relleno);

    boton.append(miniatura, nombre, pista);
    boton.addEventListener("click", () => this.ir(i));
    return boton;
  }

  ir(indice) {
    const total = this.#diapositivas.length;
    this.#mostrar(((indice % total) + total) % total);
  }

  #mostrar(indice) {
    this.#actual = indice;
    this.#diapositivas.forEach((d, i) => {
      const activa = i === indice;
      d.classList.toggle("activa", activa);
      d.inert = !activa;
    });
    this.#puntos.forEach((p, i) => {
      const relleno = p.querySelector("[data-progreso]");
      relleno.classList.remove("animate-progreso");
      if (i === indice) {
        p.setAttribute("aria-current", "true");
        // Forzar un reflow entre quitar y poner la clase reinicia la animación
        // aunque se vuelva a la misma diapositiva.
        void relleno.offsetWidth;
        relleno.classList.add("animate-progreso");
      } else {
        p.removeAttribute("aria-current");
      }
    });
  }

  #actualizarPausa() {
    const pausado = this.#pausadoPorUsuario || this.#pausadoTemporal || document.hidden;
    this.#raiz.classList.toggle("pausado", pausado);
    this.#pista.setAttribute("aria-live", this.#pausadoPorUsuario ? "polite" : "off");
    // El botón refleja la intención del usuario, no la pausa temporal por hover.
    const enPausa = this.#pausadoPorUsuario;
    this.#botonPausa.querySelector("[data-icono]").textContent = enPausa ? "▶" : "❚❚";
    this.#botonPausa.querySelector("[data-texto]").textContent = enPausa ? "Reanudar" : "Pausar";
    this.#botonPausa.setAttribute("aria-label", enPausa ? "Reanudar rotación automática de novedades" : "Pausar rotación automática de novedades");
  }
}
