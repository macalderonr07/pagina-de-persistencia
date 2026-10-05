// Formulario de contacto.
//
// Reparto de persistencia pedido por el reto:
//   - correo y teléfono        -> localStorage  (se recuerdan entre visitas si el usuario lo permite)
//   - nombre, documento,
//     dirección y mensaje      -> sessionStorage (datos más delicados: mueren con la pestaña)
// Esto además cumple WCAG 3.3.7 (Entrada redundante): no hay que volver a escribir
// lo que ya se escribió antes.
//
// Envío: no hay backend (proyecto académico). El mensaje entra en la "bandeja de
// salida" de IndexedDB SIN documento ni dirección (minimización de datos). Si hay
// red se marca como enviado (simulado); si no, queda "pendiente" y se procesa al
// volver la conexión (evento "online").

import { CLAVES, local, sesion } from "./storage.js";
import * as db from "./db.js";

const CAMPOS_LOCAL = ["email", "telefono"];
const CAMPOS_SESION = ["nombre", "documento", "direccion", "mensaje"];

const REGLAS = {
  email: (v) => {
    if (!v) return "Escribe tu correo electrónico.";
    // Validación pragmática: algo@algo.tld (la validación real la haría el servidor).
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return "El correo debe tener el formato nombre@dominio.com.";
    return "";
  },
  telefono: (v) => {
    if (!v) return "Escribe tu número de teléfono.";
    if (!/^\+?[\d\s-]+$/.test(v)) return "El teléfono solo puede tener dígitos, espacios, guiones y un + inicial.";
    const digitos = v.replace(/\D/g, "").length;
    if (digitos < 7 || digitos > 15) return "El teléfono debe tener entre 7 y 15 dígitos.";
    return "";
  },
  nombre: (v) => (v.trim().length >= 3 ? "" : "Escribe tu nombre completo (al menos 3 letras)."),
  documento: (v) => (!v || /^[A-Za-z0-9-]{5,20}$/.test(v) ? "" : "El documento debe tener de 5 a 20 letras o números, sin espacios."),
  mensaje: (v) => (v.trim().length >= 10 ? "" : "Escribe un mensaje de al menos 10 caracteres."),
};

const ETIQUETAS = { email: "Correo electrónico", telefono: "Teléfono", nombre: "Nombre completo", documento: "Cédula o documento", mensaje: "Mensaje" };

export function iniciarContacto({ anunciar, alCambiarDatos }) {
  const form = document.querySelector("#form-contacto");
  const recordar = document.querySelector("#c-recordar");
  const estado = document.querySelector("#estado-contacto");
  const resumen = document.querySelector("#resumen-errores");
  const listaErrores = document.querySelector("#lista-errores");
  const contador = document.querySelector("#c-mensaje-contador");
  const campo = (nombre) => form.elements.namedItem(nombre);

  // ---- Restaurar ----
  recordar.checked = local.leer(CLAVES.recordarContacto, true) !== false;
  const guardadoLocal = local.leer(CLAVES.contacto, {}) ?? {};
  const guardadoSesion = sesion.leer(CLAVES.contactoPrivado, {}) ?? {};
  CAMPOS_LOCAL.forEach((n) => { if (typeof guardadoLocal[n] === "string") campo(n).value = guardadoLocal[n]; });
  CAMPOS_SESION.forEach((n) => { if (typeof guardadoSesion[n] === "string") campo(n).value = guardadoSesion[n]; });
  contador.textContent = String(campo("mensaje").value.length);

  // ---- Guardado automático mientras se escribe ----
  const guardarLocal = () => {
    if (!recordar.checked) return;
    local.guardar(CLAVES.contacto, Object.fromEntries(CAMPOS_LOCAL.map((n) => [n, campo(n).value.trim()])));
  };
  const guardarSesion = () =>
    sesion.guardar(CLAVES.contactoPrivado, Object.fromEntries(CAMPOS_SESION.map((n) => [n, campo(n).value])));

  let temporizador;
  form.addEventListener("input", (evento) => {
    const nombre = evento.target.name;
    if (nombre === "mensaje") contador.textContent = String(evento.target.value.length);
    clearTimeout(temporizador);
    // El debounce es uno solo para todo el formulario, así que al vencer se guardan
    // AMBOS grupos: si se guardara solo el último campo editado, los anteriores se perderían.
    temporizador = setTimeout(() => {
      guardarLocal();
      guardarSesion();
      alCambiarDatos?.();
    }, 300);
    // Si el campo estaba marcado con error, se revalida en vivo para quitar el aviso.
    if (evento.target.getAttribute("aria-invalid") === "true") validarCampo(nombre);
  });

  recordar.addEventListener("change", () => {
    local.guardar(CLAVES.recordarContacto, recordar.checked);
    if (recordar.checked) {
      guardarLocal();
      anunciar("Tu correo y teléfono se recordarán en este dispositivo.");
    } else {
      local.borrar(CLAVES.contacto);
      anunciar("Se borraron tu correo y teléfono de este dispositivo.");
    }
    alCambiarDatos?.();
  });

  // ---- Validación accesible ----
  function validarCampo(nombre) {
    const regla = REGLAS[nombre];
    if (!regla) return "";
    const input = campo(nombre);
    const error = regla(input.value.trim());
    const nodoError = document.querySelector(`#c-${nombre}-error`);
    input.setAttribute("aria-invalid", error ? "true" : "false");
    nodoError.textContent = error ? `⚠ ${error}` : "";
    nodoError.hidden = !error;
    return error;
  }

  form.addEventListener("focusout", (evento) => {
    // Validar al salir del campo solo si ya tiene contenido: no regañar antes de tiempo.
    const nombre = evento.target.name;
    if (REGLAS[nombre] && evento.target.value) validarCampo(nombre);
  });

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    estado.textContent = "";
    const errores = Object.keys(REGLAS)
      .map((nombre) => ({ nombre, error: validarCampo(nombre) }))
      .filter((e) => e.error);

    if (errores.length) {
      // WCAG 3.3.1: resumen de errores con enlaces a cada campo; el foco va al resumen.
      listaErrores.replaceChildren(
        ...errores.map(({ nombre, error }) => {
          const li = document.createElement("li");
          const a = document.createElement("a");
          a.href = `#c-${nombre}`;
          a.className = "font-semibold underline underline-offset-2";
          a.textContent = `${ETIQUETAS[nombre]}: ${error}`;
          a.addEventListener("click", (e) => {
            e.preventDefault();
            campo(nombre).focus();
          });
          li.append(a);
          return li;
        })
      );
      resumen.hidden = false;
      resumen.focus();
      return;
    }
    resumen.hidden = true;

    const mensaje = {
      fecha: new Date().toISOString(),
      email: campo("email").value.trim(),
      telefono: campo("telefono").value.trim(),
      nombre: campo("nombre").value.trim(),
      mensaje: campo("mensaje").value.trim(),
      estado: navigator.onLine ? "enviado" : "pendiente",
    };
    try {
      await db.agregar(db.ALMACENES.bandeja, mensaje);
    } catch (error) {
      estado.className = "sm:col-span-2 font-semibold text-red-800";
      estado.textContent = `No se pudo guardar el mensaje: ${error.message}`;
      return;
    }

    // Se limpian los datos delicados de la sesión: ya cumplieron su función.
    ["documento", "direccion", "mensaje"].forEach((n) => { campo(n).value = ""; });
    contador.textContent = "0";
    guardarSesion();
    guardarLocal();

    estado.className = "sm:col-span-2 font-semibold text-green-800";
    estado.textContent = mensaje.estado === "enviado"
      ? "✔ Consulta enviada. Te responderemos a tu correo. (Demo: el envío es simulado.)"
      : "✔ Sin conexión: tu consulta quedó en la bandeja de salida y se enviará al reconectar.";
    await actualizarBandeja();
    alCambiarDatos?.();
  });

  document.querySelector("#boton-borrar-contacto").addEventListener("click", () => {
    borrarDatosContacto();
    [...CAMPOS_LOCAL, ...CAMPOS_SESION].forEach((n) => {
      campo(n).value = "";
      campo(n).removeAttribute("aria-invalid");
      const err = document.querySelector(`#c-${n}-error`);
      if (err) err.hidden = true;
    });
    contador.textContent = "0";
    resumen.hidden = true;
    estado.textContent = "";
    anunciar("Se borraron los datos del formulario de este dispositivo.");
    alCambiarDatos?.();
  });

  // ---- Bandeja de salida ----
  async function actualizarBandeja() {
    const resumenBandeja = document.querySelector("#bandeja-resumen");
    try {
      const mensajes = await db.obtenerTodos(db.ALMACENES.bandeja);
      const pendientes = mensajes.filter((m) => m.estado === "pendiente").length;
      const enviados = mensajes.length - pendientes;
      resumenBandeja.textContent =
        `${pendientes} ${pendientes === 1 ? "mensaje pendiente" : "mensajes pendientes"}, ` +
        `${enviados} ${enviados === 1 ? "enviado" : "enviados"}.`;
    } catch {
      resumenBandeja.textContent = "No se pudo leer la bandeja de salida.";
    }
  }

  async function procesarPendientes() {
    if (!navigator.onLine) return;
    try {
      const mensajes = await db.obtenerTodos(db.ALMACENES.bandeja);
      const pendientes = mensajes.filter((m) => m.estado === "pendiente");
      if (!pendientes.length) return;
      // Aquí iría el fetch POST al servidor; en la demo se marca como enviado.
      await Promise.all(pendientes.map((m) => db.poner(db.ALMACENES.bandeja, { ...m, estado: "enviado", enviado: new Date().toISOString() })));
      anunciar(`Conexión recuperada: se ${pendientes.length === 1 ? "envió 1 mensaje pendiente" : `enviaron ${pendientes.length} mensajes pendientes`}.`);
      await actualizarBandeja();
      alCambiarDatos?.();
    } catch (error) {
      console.warn("[contacto] No se pudo procesar la bandeja:", error);
    }
  }

  window.addEventListener("online", procesarPendientes);
  actualizarBandeja().then(procesarPendientes);

  return { actualizarBandeja };
}

export function borrarDatosContacto() {
  local.borrar(CLAVES.contacto);
  sesion.borrar(CLAVES.contactoPrivado);
}
