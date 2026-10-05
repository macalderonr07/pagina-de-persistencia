/** @type {import('tailwindcss').Config} */
// Tailwind se COMPILA a assets/styles.css (npm run build:css) en lugar de usar el
// Play CDN: el CDN es un script remoto que genera CSS en tiempo de ejecución, así que
// sin red la página quedaría sin estilos. Un CSS estático sí entra en la caché del
// Service Worker y funciona offline.
module.exports = {
  // Se escanean las tres páginas (*.html) y también los módulos JS porque view.js arma clases de Tailwind al
  // renderizar tarjetas, chips y el carrito.
  content: ["./*.html", "./js/**/*.js"],
  theme: {
    extend: {
      colors: {
        // Paleta basada en la tríada primaria del RX-78-2 (azul / rojo / amarillo),
        // aplicada con la regla 60-30-10: 60 % neutros (slate), 30 % azul marino
        // estructural (header, footer) y 10 % amarillo de acento. El rojo se reserva
        // para errores y acciones destructivas, para no confundir su significado.
        navy: {
          950: "#0A1530",
          900: "#0F1E3D",
          800: "#1B2E57",
          700: "#27407A",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Ubuntu", "sans-serif"],
      },
      // Animaciones del carrusel de novedades. Se usan como clases de Tailwind
      // (animate-kenburns, animate-entrar, animate-progreso) combinadas con:
      //   group-[.activa]:  -> solo corren en la diapositiva visible; al volver a
      //                        activarse una diapositiva, se reinician solas.
      //   motion-safe:      -> no corren si el sistema pide "reducir movimiento".
      keyframes: {
        // Zoom lento sobre la foto ("efecto Ken Burns").
        kenburns: {
          "0%": { transform: "scale(1) translate(0, 0)" },
          "100%": { transform: "scale(1.14) translate(-2%, -1.5%)" },
        },
        // Entrada de textos: suben y aparecen.
        entrar: {
          "0%": { opacity: "0", transform: "translateY(1.5rem)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        // Entrada del número decorativo desde la derecha.
        deslizar: {
          "0%": { opacity: "0", transform: "translateX(3rem)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        // Barra de progreso hasta la siguiente novedad. Su fin (animationend)
        // es lo que hace avanzar el carrusel: pausar la animación pausa la rotación.
        progreso: {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
        // Brillo que cruza el botón principal.
        brillo: {
          "0%": { transform: "translateX(-120%) skewX(-20deg)" },
          "60%, 100%": { transform: "translateX(320%) skewX(-20deg)" },
        },
      },
      animation: {
        kenburns: "kenburns 7s ease-out forwards",
        entrar: "entrar 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        deslizar: "deslizar 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        progreso: "progreso 6s linear forwards",
        brillo: "brillo 3s ease-in-out 1s infinite",
      },
      minHeight: { tap: "2.75rem" },
      minWidth: { tap: "2.75rem" },
    },
  },
  plugins: [],
};
