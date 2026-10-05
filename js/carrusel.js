// Carrusel accesible de novedades (patrón "Carousel" de las WAI-ARIA APG).
//
// Decisiones de accesibilidad:
//   - WCAG 2.2.2 (Pausar, detener, ocultar): todo lo que se mueve solo más de 5 s
//     necesita un control para pausarlo. El botón de pausa es el PRIMERO en el orden
//     de tabulación para que se alcance antes que el contenido que cambia.
//   - Si el foco del teclado entra al carrusel, la rotación se detiene y no vuelve a
//     arrancar sola: quien lee con lector de pantalla no debe perder la diapositiva.
//   - El ratón encima pausa de forma temporal (al salir se reanuda).
//   - prefers-reduced-motion: el carrusel arranca pausado y sin transiciones.
//   - Mientras rota, la región tiene aria-live="off" (no anunciar cada 6 s); en pausa
//     pasa a "polite" para que se anuncie el cambio hecho con los botones.
//   - Las diapositivas ocultas llevan `inert`: no reciben foco ni las lee el lector.

const INTERVALO_MS = 6000;

export class Carrusel {
  #raiz;
  #pista;
  #diapositivas = [];
  #puntos = [];
  #botonPausa;
  #actual = 0;
  #temporizador = null;
  #pausadoPorUsuario;
  #pausadoTemporal = false;

  /**
   * @param {HTMLElement} raiz  <section> del carrusel (con los controles ya en el HTML)
   * @param {HTMLElement[]} diapositivas  contenido de cada diapositiva
   */
  constructor(raiz, diapositivas) {
    this.#raiz = raiz;
    this.#pista = raiz.querySelector("[data-pista]");
    this.#botonPausa = raiz.querySelector("[data-pausa]");
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.#pausadoPorUsuario = reducido;

    const total = diapositivas.length;
    this.#diapositivas = diapositivas.map((contenido, i) => {
      const d = document.createElement("div");
      d.className = "carrusel-diapositiva";
      d.setAttribute("role", "group");
      d.setAttribute("aria-roledescription", "diapositiva");
      d.setAttribute("aria-label", `${i + 1} de ${total}`);
      d.id = `diapositiva-${i}`;
      d.append(contenido);
      return d;
    });
    this.#pista.replaceChildren(...this.#diapositivas);

    const selector = raiz.querySelector("[data-puntos]");
    this.#puntos = diapositivas.map((_, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "carrusel-punto";
      b.setAttribute("aria-controls", `diapositiva-${i}`);
      b.setAttribute("aria-label", `Diapositiva ${i + 1}: ${diapositivas[i].dataset.titulo ?? ""}`);
      b.addEventListener("click", () => this.ir(i));
      return b;
    });
    selector.replaceChildren(...this.#puntos);

    raiz.querySelector("[data-anterior]").addEventListener("click", () => this.ir(this.#actual - 1));
    raiz.querySelector("[data-siguiente]").addEventListener("click", () => this.ir(this.#actual + 1));
    this.#botonPausa.addEventListener("click", () => {
      this.#pausadoPorUsuario = !this.#pausadoPorUsuario;
      this.#actualizarRotacion();
    });

    // El foco detiene la rotación de forma definitiva (hasta pulsar "Reanudar"),
    // salvo que el foco esté en el propio botón de pausa.
    raiz.addEventListener("focusin", (evento) => {
      if (evento.target !== this.#botonPausa && !this.#pausadoPorUsuario) {
        this.#pausadoPorUsuario = true;
        this.#actualizarRotacion();
      }
    });
    raiz.addEventListener("mouseenter", () => {
      this.#pausadoTemporal = true;
      this.#actualizarRotacion();
    });
    raiz.addEventListener("mouseleave", () => {
      this.#pausadoTemporal = false;
      this.#actualizarRotacion();
    });
    // Pestaña en segundo plano: no gastar CPU ni batería rotando.
    document.addEventListener("visibilitychange", () => this.#actualizarRotacion());

    if (total < 2) raiz.querySelectorAll("[data-anterior], [data-siguiente], [data-pausa], [data-puntos]").forEach((n) => (n.hidden = true));
    this.#mostrar(0);
    this.#actualizarRotacion();
  }

  ir(indice) {
    const total = this.#diapositivas.length;
    this.#mostrar(((indice % total) + total) % total);
    // Un cambio manual reinicia la cuenta para que la siguiente no llegue enseguida.
    this.#actualizarRotacion();
  }

  #mostrar(indice) {
    this.#actual = indice;
    this.#diapositivas.forEach((d, i) => {
      const activa = i === indice;
      d.classList.toggle("activa", activa);
      d.inert = !activa;
    });
    this.#puntos.forEach((p, i) => {
      // aria-current comunica cuál está activa (no solo el color del punto: WCAG 1.4.1).
      if (i === indice) p.setAttribute("aria-current", "true");
      else p.removeAttribute("aria-current");
    });
  }

  #actualizarRotacion() {
    clearInterval(this.#temporizador);
    this.#temporizador = null;
    const rotando = !this.#pausadoPorUsuario && !this.#pausadoTemporal && !document.hidden && this.#diapositivas.length > 1;
    if (rotando) this.#temporizador = setInterval(() => this.#mostrar((this.#actual + 1) % this.#diapositivas.length), INTERVALO_MS);

    this.#pista.setAttribute("aria-live", this.#pausadoPorUsuario ? "polite" : "off");
    // El botón refleja la intención del usuario, no la pausa temporal por hover.
    const pausado = this.#pausadoPorUsuario;
    this.#botonPausa.querySelector("[data-icono]").textContent = pausado ? "▶" : "❚❚";
    this.#botonPausa.querySelector("[data-texto]").textContent = pausado ? "Reanudar" : "Pausar";
    this.#botonPausa.setAttribute("aria-label", pausado ? "Reanudar rotación automática de novedades" : "Pausar rotación automática de novedades");
  }
}
