# Hangar Kits — PWA de model kits (offline-first)

**Demo en vivo:** https://macalderonr07.github.io/pagina-de-persistencia/

Tienda ficticia y académica de model kits (Gunpla, Tamiya, Zoids, Macross, aviación)
hecha con **HTML5 semántico, Tailwind CSS + CSS Grid, JavaScript ES6+ (módulos)** y
pensada para **funcionar sin conexión** y cumplir **WCAG 2.2 AA**.

## Cómo ejecutarla

Un Service Worker **no funciona con `file://`**: hace falta un servidor (localhost cuenta como contexto seguro).

```bash
cd "pagina web progresiva/hangar-kits"
python3 -m http.server 8080        # o: npm run serve
# abrir http://localhost:8080
```

Para probar el modo offline: abrir la página una vez con red → DevTools → *Network* → *Offline*
(o desconectar el wifi) → recargar. La tienda abre completa: portada, catálogo, fichas de producto,
imágenes, filtros, carrito, pedidos y formulario.

## Páginas

| Página | Qué muestra |
|---|---|
| `index.html` | Carrusel de **novedades** (productos con `"nuevo": true`, del ingreso más reciente al más antiguo), categorías en **barras diagonales** que llevan a `catalogo.html?categoria=…`, y formulario de contacto |
| `catalogo.html` | Catálogo con filtros (categoría, marca, franquicia, escala, texto), orden y vista cuadrícula/lista. Los filtros se leen de la URL (`?categoria=high-grade&orden=precio-asc`) y se reflejan en ella con `history.replaceState`, así el enlace se puede compartir |
| `producto.html?id=…` | Ficha del kit: **galería de al menos 3 fotos**, precio, stock, cantidad, especificaciones, migas de pan y productos relacionados (misma categoría, luego misma franquicia) |

**Carrusel** (patrón *Carousel* de las WAI-ARIA APG), animado con **Tailwind**: las animaciones están
definidas en `tailwind.config.js` (`keyframes`/`animation`) y se aplican con clases como
`motion-safe:group-[.activa]:animate-kenburns`:
- foto a pantalla completa con zoom lento (*Ken Burns*), degradado para el contraste del texto y número grande decorativo;
- textos que entran escalonados (`animate-entrar` + `[animation-delay:…]`) cada vez que cambia la diapositiva;
- selector con miniaturas y **barra de progreso** (`animate-progreso`, 6 s). El fin de esa animación
  (`animationend`) es lo que avanza el carrusel: pausar = `animation-play-state: paused` vía la clase
  `pausado` y la variante `group-[.pausado]/carrusel:`, sin `setInterval`.

Accesibilidad: botón Pausar/Reanudar primero entre los controles (WCAG 2.2.2; también detiene el zoom,
el aro "Nuevo" y el destello del botón), rotación que se detiene si el foco entra al carrusel, pausa
temporal con el ratón encima, `prefers-reduced-motion` (arranca pausado y sin zoom ni entradas),
`aria-live` solo en pausa, diapositivas ocultas con `inert` y miniatura activa con `aria-current`.

**Categorías**: cada una tiene en el JSON una foto con el kit centrado y un punto focal (`foco`, p. ej.
`"45% 40%"`) que se aplica como `object-position`, porque la barra solo deja ver una franja de la foto.

**Galería de la ficha**: foto grande con botones anterior/siguiente, contador "Foto n de N" (anunciado con
`aria-live` solo cuando el usuario cambia de foto) y miniaturas como `<button aria-pressed>`. Las flechas ←/→
cambian de foto cuando el foco está en la galería. Cada foto tiene su propio `alt`, su crédito y, si hace
falta, una **nota** visible (ver "Créditos de imágenes").

**Barras diagonales**: cada barra es un enlace real (funciona con teclado, clic central y sin JS en la
página destino). En escritorio son columnas inclinadas con `skewX(-12deg)` y el contenido se
contra-inclina para que la foto quede derecha; con hover o foco la barra se ensancha y muestra la
descripción. En móvil se apilan y la diagonal se hace con `clip-path`. El foco se dibuja sobre el bloque
de texto porque el contorno del enlace quedaría recortado por `overflow: hidden`.

Si se modifica `assets/tailwind.css` o se agregan clases nuevas en el HTML/JS:

```bash
npm install          # una sola vez (instala el CLI de Tailwind 3.4)
npm run build:css    # regenera assets/styles.css
```

> Si cambias cualquier archivo precargado, sube `VERSION` en `sw.js`; si no, los navegadores
> que ya visitaron el sitio seguirán usando la copia en caché. La página muestra el aviso
> "Actualizar ahora" cuando detecta una versión nueva.

## Verificación automática (GitHub Actions)

Cada push a `main` de **pagina-de-persistencia** corre el workflow
`.github/workflows/verificar-y-publicar.yml`: **primero verifica y solo si todo pasa publica** en
GitHub Pages. Si una verificación falla, el job "Publicar" no corre y el sitio en línea queda como estaba.
En un pull request solo verifica.

| Paso | Qué comprueba | Comando |
|---|---|---|
| Estática | Sintaxis de todo el JS; `productos.json` (campos, ids únicos, ≥ 3 fotos por kit con `alt`, crédito CC y archivo existente); que el SW precargue archivos que existen (y todos los módulos JS); manifest e íconos; que cada `src`/`href` local exista; que `assets/styles.css` esté compilado con la última versión | `npm run verificar:estatico` |
| HTML | Validación con `html-validate` (reglas recomendadas; excepciones documentadas en `.htmlvalidate.mjs`) | `npm run verificar:html` |
| Navegador | Chromium real con Playwright: las 3 páginas en escritorio, iPhone SE (320 px), Pixel 5 e iPad Mini, **sin errores de JS, sin scroll horizontal y con 0 violaciones de axe (WCAG 2.2 AA)**; carrusel automático y su pausa, filtros por URL, búsqueda, galería, carrito, ficha inexistente (sin inyección del id) y **modo sin conexión** | `npm run verificar:e2e` |

Todo junto en local: `npm ci && npx playwright install chromium && npm run verificar`.
`npm run preparar-sitio` arma `_site/` con solo lo publicable (sin scripts ni configuración).

## Estructura

```
index.html              portada: carrusel de novedades, barras de categorías, contacto
catalogo.html           catálogo con filtros + <template> de tarjeta
producto.html           ficha de producto + relacionados
                        (las tres comparten header, footer y el <dialog> del carrito)
manifest.webmanifest    instalación como app
sw.js                   Service Worker (en la raíz para que su scope cubra todo el sitio)
.github/workflows/      verificar-y-publicar.yml (CI/CD de GitHub Actions)
scripts/                verificar-estatico.mjs, verificar-e2e.mjs, preparar-sitio.mjs
.htmlvalidate.mjs       configuración del validador de HTML
assets/
  tailwind.css          fuente de estilos (Tailwind + capa base/componentes)
  styles.css            CSS compilado (NO editar a mano)
  img/                  88 fotos (WebP 800×600): <id>.webp es la principal, <id>-2/-3/-4 las de la galería
  icons/                íconos de la PWA
data/productos.json     categorías + catálogo (marca, línea, franquicia, serie, escala, precio,
                        stock, categoría, nuevo/ingreso, imagenes[] con alt, crédito y nota)
js/
  comun.js              marco común: menú, carrito, estado de red, SW, instalación, borrado de datos
  inicio.js             portada (carrusel + barras + contacto)
  catalogo.js           filtros (URL + sessionStorage), orden, vista
  producto.js           ficha, compra con cantidad, relacionados
  carrusel.js           clase Carrusel accesible
  repo.js               catálogo: IndexedDB primero, red después; filtros, facetas, novedades, relacionados
  db.js                 envoltorio de IndexedDB con Promesas
  storage.js            localStorage / sessionStorage / cookies
  cart.js               carrito (clase con campos privados, EventTarget)
  contact.js            formulario de contacto, validación accesible, bandeja de salida
  view.js               renderizado del DOM (sin innerHTML con datos)
```

## Persistencia: qué se guarda dónde

| Mecanismo | Qué guarda | Por qué ahí |
|---|---|---|
| Mecanismo | Qué guarda | Duración | Por qué ahí |
|---|---|---|---|
| **IndexedDB** (`HangarKitsDB`) | Catálogo completo (almacén `productos`, con índices por marca/franquicia/escala), categorías y versión (`meta`), pedidos confirmados (`pedidos`), bandeja de salida de mensajes (`bandeja`) | Permanente, hasta que se borre | Datos estructurados y voluminosos, consultas por índice, asíncrono (no bloquea la página). Las tres páginas leen de aquí, así el catálogo se descarga una sola vez |
| **sessionStorage** | Filtros del catálogo (`hk_filtros_v1`); nombre, documento, dirección y mensaje del formulario (`hk_contacto_privado_v1`) | Hasta cerrar la pestaña | Los filtros solo importan durante la visita; los datos delicados mueren al cerrar la pestaña |
| **localStorage** | Correo y teléfono (`hk_contacto_v1`) si se marca "Recordar"; carrito (`hk_carrito_v1`, solo `{id, cantidad}`) | Permanente | Deben sobrevivir entre visitas. El carrito no guarda precios: se recalculan siempre contra el catálogo |
| **Cookies** | Vista preferida del catálogo (`hk_vista`), fecha de la última visita (`hk_ultima_visita`) | 180 días | Preferencias mínimas sin datos personales (`SameSite=Lax`, `Secure` con HTTPS) |
| **Cache Storage** | Las tres páginas, CSS, JS, íconos, imágenes y `productos.json` | Hasta que se publique una versión nueva del SW | Lo usa el Service Worker para abrir la app sin red |
| **URL** (no es almacenamiento, pero conserva estado) | Filtros del catálogo (`?categoria=…&marca=…&q=…&orden=…`) e id del producto | Mientras exista el enlace | Permite compartir una búsqueda o una ficha |

**Cómo inspeccionarlo**: DevTools → *Application* (Chrome) o *Almacenamiento* (Firefox) muestra cada
mecanismo. El botón **"Borrar mis datos de este dispositivo"** del pie de página vacía carrito, filtros,
contacto, pedidos, bandeja y cookies, y recarga para volver a descargar el catálogo (confirmación en línea,
sin `window.confirm`).

## Estrategia offline

1. **Instalación del SW**: precarga las tres páginas, CSS, JS, íconos y `productos.json`; las imágenes se
   leen del propio JSON (productos y categorías), así agregar un kit no obliga a tocar `sw.js`.
2. **Catálogo**: `repo.js` pinta primero desde IndexedDB (instantáneo, sin red) y en paralelo pide
   el JSON; si hay versión nueva, la guarda en IndexedDB en **una sola transacción** y vuelve a pintar.
3. **HTML**: red primero, caché de respaldo. Cada página se guarda con su ruta y **sin query string**
   (`producto.html?id=hg-exia` → `producto.html`), así cualquier ficha abre offline.
   **JSON**: *stale-while-revalidate*. **Estáticos**: caché primero.
4. **Acciones sin red**: los pedidos se guardan en IndexedDB; los mensajes de contacto quedan
   "pendientes" en la bandeja y se procesan con el evento `online` (envío simulado: no hay backend).

## Diseño responsivo (mobile-first)

Las clases sin prefijo de Tailwind son para el celular; `sm:` (640 px), `md:` (768 px), `lg:` y `xl:` agregan
lo que cabe en pantallas más grandes. Probado en iPhone SE (320 px), Galaxy S9+, Pixel 5, iPhone 12 Pro Max
e iPad Mini: sin scroll horizontal y sin zoom.

- **Header compacto en celular**: una sola fila (logo · carrito · ☰). Los textos "Menú", "Carrito" e
  "Instalar app" quedan como `sr-only` (siguen siendo el nombre accesible) y se ven desde `sm:`.
- **Tarjetas en 2 columnas desde 320 px**: foto, marca, nombre, stock, precio y "Agregar". Descripción,
  línea y dificultad aparecen desde `sm:`; siguen completas en la ficha. El catálogo pasó de ~19 000 px
  de alto en un celular a ~6 000 px.
- **Vista Lista** en celular: fila horizontal (foto de 7,5 rem | datos).
- Galería, carrusel y barras de categorías tienen sus propias variantes para celular.

## Accesibilidad (WCAG 2.2 AA) y teclado

- Landmarks (`header`, `nav`, `main`, `aside`, `footer`), jerarquía de títulos, `lang="es"`.
- Enlace "Saltar al contenido" (2.4.1); foco visible de dos tonos (2.4.7, 1.4.11).
- `scroll-padding-top` para que el header sticky no tape el foco (2.4.11, nuevo en 2.2).
- Objetivos táctiles de al menos 44×44 px (2.5.8 pide 24 px).
- Carrito en `<dialog>` modal nativo: confina el foco, `Esc` cierra y el foco vuelve al botón (2.4.3).
- Después de agregar o cambiar cantidades el foco **no se pierde** al re-renderizar.
- Regiones `aria-live` / `role="status"` para resultados, carrito y estado de red (4.1.3).
- Formulario: `label` en cada campo, `autocomplete`, errores con `aria-invalid` +
  `aria-describedby`, resumen de errores enfocable con enlaces (3.3.1, 3.3.3).
- Datos recordados entre visitas, sin volver a escribirlos (3.3.7, nuevo en 2.2).
- La información nunca se transmite solo con color (1.4.1); contraste AA en toda la paleta.

Verificado con **axe-core** (etiquetas wcag2a/aa, wcag21aa, wcag22aa) en escritorio y móvil: 0 violaciones.
Igual conviene una revisión manual con lector de pantalla (NVDA/Orca).

## Diseño (teoría del color e IHC)

- **Paleta**: tríada primaria del RX-78-2 (azul / rojo / amarillo) con la regla **60-30-10**:
  60 % neutros (slate), 30 % azul marino estructural (header/footer), 10 % amarillo de acento
  para acciones de alto nivel (carrito, "Ver catálogo"). El azul `blue-700` es el color de acción
  primaria; el **rojo se reserva para errores y acciones destructivas**, así su significado es consistente.
- **IHC**: reconocer antes que recordar (categorías como botones con conteo, chips de filtros
  activos), visibilidad del estado del sistema (barra de conexión, origen del catálogo, bandeja),
  control y libertad del usuario (quitar filtros, vaciar carrito, borrar datos con confirmación),
  prevención de errores (stock máximo, validación en línea) y consistencia (un solo sistema de botones).

## Créditos de imágenes

Fotos de kits reales armados por sus autores, obtenidas de Flickr/Wikimedia Commons vía
Openverse con licencias **CC BY 2.0 / CC BY-SA 2.0**. Autor, licencia y enlace al original de
cada una de las 88 fotos están en `data/productos.json`, bajo cada foto de la galería y en el pie de
la página ("Créditos de las fotografías").

Cada kit tiene al menos 3 fotos, revisadas una por una para confirmar que muestran ese modelo. Cuando
no había 3 fotos libres del **mismo** kit, la foto lleva una nota visible que lo dice:
- *Mismo mobile suit, armado por otro modelista* (ν Gundam, Hi-ν, Wing Zero, MG RX-78-2).
- *Referencia: el vehículo real* o *réplica en exhibición* (Jagdtiger, Spitfire) y *el mismo auto en escala 1/12* (Porsche 956).
- *Proceso de armado* (Gouf Custom: las fotos libres del kit son del armado).
- *Detalle recortado de la foto…* (Delta Plus, Liger Zero, GP03 Dendrobium).

El antiguo "HG Beargguy (versión rosa)" se reemplazó por el **HGBF Beargguy III (San)**: del rosa solo
existe una foto con licencia libre.
Las fotos se recortaron a 4:3 (las verticales se encajan sobre un fondo desenfocado de la misma foto, para no cortar el kit) y se convirtieron a WebP (obra derivada, misma licencia en las BY-SA).
Marcas y franquicias pertenecen a sus dueños; precios referenciales.
