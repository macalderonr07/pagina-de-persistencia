// Envoltorios de Web Storage y cookies.
//
// Reparto de responsabilidades (ver README):
//   localStorage   -> datos que deben sobrevivir al cerrar el navegador y no son muy
//                     sensibles: correo y teléfono de contacto, carrito.
//   sessionStorage -> datos que solo deben vivir mientras la pestaña está abierta:
//                     filtros de búsqueda y datos de contacto delicados (documento,
//                     dirección, mensaje). Se borran solos al cerrar la pestaña.
//   cookies        -> preferencias mínimas sin datos personales (vista, última visita).
//   IndexedDB      -> catálogo, pedidos y bandeja de salida (ver db.js).
//
// Toda lectura/escritura está en try/catch: Web Storage puede lanzar en modo privado
// estricto o con la cuota llena, y la página tiene que seguir funcionando igual.

export const CLAVES = Object.freeze({
  contacto: "hk_contacto_v1", // local: { email, telefono }
  recordarContacto: "hk_recordar_contacto_v1", // local: boolean
  carrito: "hk_carrito_v1", // local: [{ id, cantidad }]
  filtros: "hk_filtros_v1", // session: { texto, marcas, franquicias, escalas, orden }
  contactoPrivado: "hk_contacto_privado_v1", // session: { nombre, documento, direccion, mensaje }
});

export const COOKIES = Object.freeze({
  vista: "hk_vista", // "cuadricula" | "lista"
  ultimaVisita: "hk_ultima_visita", // ISO 8601
});

function crearAlmacen(obtenerStorage) {
  return {
    leer(clave, porDefecto = null) {
      try {
        const crudo = obtenerStorage().getItem(clave);
        return crudo === null ? porDefecto : JSON.parse(crudo);
      } catch {
        return porDefecto;
      }
    },
    guardar(clave, valor) {
      try {
        obtenerStorage().setItem(clave, JSON.stringify(valor));
        return true;
      } catch {
        return false;
      }
    },
    borrar(clave) {
      try {
        obtenerStorage().removeItem(clave);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export const local = crearAlmacen(() => window.localStorage);
export const sesion = crearAlmacen(() => window.sessionStorage);

export const cookies = {
  leer(nombre) {
    const prefijo = `${nombre}=`;
    const fila = document.cookie.split("; ").find((parte) => parte.startsWith(prefijo));
    return fila ? decodeURIComponent(fila.slice(prefijo.length)) : null;
  },
  guardar(nombre, valor, dias = 180) {
    const segundos = Math.round(dias * 24 * 60 * 60);
    // SameSite=Lax evita que la cookie viaje en peticiones cross-site; no lleva
    // datos personales, así que no hace falta más. "Secure" solo si hay HTTPS
    // (en http://localhost el navegador la descartaría).
    const seguro = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${nombre}=${encodeURIComponent(valor)}; path=/; max-age=${segundos}; SameSite=Lax${seguro}`;
  },
  borrar(nombre) {
    document.cookie = `${nombre}=; path=/; max-age=0; SameSite=Lax`;
  },
};
