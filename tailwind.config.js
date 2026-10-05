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
      minHeight: { tap: "2.75rem" },
      minWidth: { tap: "2.75rem" },
    },
  },
  plugins: [],
};
