// Ids legibles con prefijo, para las tablas cuya PK es `text` (campanas,
// templates).
//
// Se generaban como `${prefijo}-${Date.now().toString(36)}`: la clave era el
// milisegundo, así que dos creaciones en el mismo milisegundo —dos operadores a
// la vez, o un doble submit que se escape del guard— colisionan. Con PK `text` y
// sin ON CONFLICT, la segunda inserción falla; peor, si el flujo hiciera upsert,
// la segunda pisaría la primera.
//
// Sigue siendo ordenable por tiempo (el timestamp va primero, en base36) y
// legible en la URL, que es para lo que se eligió este formato en vez de un
// UUID. El sufijo aleatorio es lo que lo hace único.
import { randomBytes } from "node:crypto";

export function prefixedId(prefix: string): string {
  const stamp = Date.now().toString(36);
  const rand = randomBytes(4).toString("hex");
  return `${prefix}-${stamp}-${rand}`;
}
