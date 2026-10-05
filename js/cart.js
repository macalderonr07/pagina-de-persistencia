// Carrito de compras.
//
// Persistencia: localStorage (sobrevive a cerrar el navegador; un carrito abandonado
// sigue ahí en la próxima visita). Solo se guardan { id, cantidad }: precio, nombre y
// stock se resuelven siempre contra el catálogo de IndexedDB, así un precio viejo en
// localStorage nunca llega al total.
//
// Los pedidos confirmados van a IndexedDB (almacén "pedidos"), por lo que se puede
// "comprar" sin conexión: el pedido queda registrado localmente.

import { CLAVES, local } from "./storage.js";
import * as db from "./db.js";

export class Carrito extends EventTarget {
  #items = new Map(); // id -> cantidad
  #catalogo = new Map(); // id -> producto

  constructor() {
    super();
    this.#cargar();
    // Sincroniza entre pestañas: el evento "storage" llega a las OTRAS pestañas.
    window.addEventListener("storage", (evento) => {
      if (evento.key === CLAVES.carrito) {
        this.#cargar();
        this.#notificar();
      }
    });
  }

  #cargar() {
    const guardado = local.leer(CLAVES.carrito, []);
    this.#items = new Map(
      (Array.isArray(guardado) ? guardado : [])
        .filter((i) => typeof i?.id === "string" && Number.isInteger(i?.cantidad) && i.cantidad > 0)
        .map((i) => [i.id, i.cantidad])
    );
  }

  #persistir() {
    const ok = local.guardar(
      CLAVES.carrito,
      [...this.#items].map(([id, cantidad]) => ({ id, cantidad }))
    );
    this.#notificar();
    return ok;
  }

  #notificar() {
    this.dispatchEvent(new Event("cambio"));
  }

  usarCatalogo(productos) {
    this.#catalogo = new Map(productos.map((p) => [p.id, p]));
    // Si un producto desapareció del catálogo, se saca del carrito; si bajó el stock, se ajusta.
    let ajustado = false;
    for (const [id, cantidad] of this.#items) {
      const producto = this.#catalogo.get(id);
      if (!producto || producto.stock === 0) {
        this.#items.delete(id);
        ajustado = true;
      } else if (cantidad > producto.stock) {
        this.#items.set(id, producto.stock);
        ajustado = true;
      }
    }
    if (ajustado) this.#persistir();
    else this.#notificar();
  }

  /** @returns {{ ok: boolean, mensaje: string }} */
  agregar(id, cantidad = 1) {
    const producto = this.#catalogo.get(id);
    if (!producto) return { ok: false, mensaje: "Ese producto ya no está en el catálogo." };
    const actual = this.#items.get(id) ?? 0;
    if (actual + cantidad > producto.stock) {
      return { ok: false, mensaje: `Solo quedan ${producto.stock} unidades de ${producto.nombre}.` };
    }
    this.#items.set(id, actual + cantidad);
    const guardado = this.#persistir();
    return {
      ok: true,
      mensaje: `${producto.nombre} agregado al carrito (${actual + cantidad} en total).` +
        (guardado ? "" : " Aviso: no se pudo guardar el carrito en este dispositivo."),
    };
  }

  cambiarCantidad(id, cantidad) {
    const producto = this.#catalogo.get(id);
    if (!producto) return { ok: false, mensaje: "Producto no encontrado." };
    if (!Number.isInteger(cantidad) || cantidad < 1) return this.quitar(id);
    const final = Math.min(cantidad, producto.stock);
    this.#items.set(id, final);
    this.#persistir();
    return {
      ok: final === cantidad,
      mensaje: final === cantidad
        ? `Cantidad de ${producto.nombre}: ${final}.`
        : `Máximo disponible de ${producto.nombre}: ${final}.`,
    };
  }

  quitar(id) {
    const producto = this.#catalogo.get(id);
    this.#items.delete(id);
    this.#persistir();
    return { ok: true, mensaje: `${producto?.nombre ?? "Producto"} quitado del carrito.` };
  }

  vaciar() {
    this.#items.clear();
    this.#persistir();
  }

  /** Líneas resueltas contra el catálogo (solo las que existen). */
  lineas() {
    return [...this.#items]
      .map(([id, cantidad]) => ({ producto: this.#catalogo.get(id), cantidad }))
      .filter((linea) => linea.producto)
      .map((linea) => ({ ...linea, subtotal: Math.round(linea.producto.precio * linea.cantidad * 100) / 100 }));
  }

  unidades() {
    return [...this.#items.values()].reduce((suma, n) => suma + n, 0);
  }

  total() {
    return Math.round(this.lineas().reduce((suma, l) => suma + l.subtotal, 0) * 100) / 100;
  }

  /** Registra el pedido en IndexedDB y vacía el carrito. Funciona sin red. */
  async confirmar() {
    const lineas = this.lineas();
    if (lineas.length === 0) throw new Error("El carrito está vacío.");
    const pedido = {
      fecha: new Date().toISOString(),
      enLinea: navigator.onLine,
      lineas: lineas.map(({ producto, cantidad, subtotal }) => ({
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad,
        subtotal,
      })),
      total: this.total(),
    };
    const id = await db.agregar(db.ALMACENES.pedidos, pedido);
    this.vaciar();
    return { ...pedido, id };
  }
}
