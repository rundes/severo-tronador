// Padrón mock para F1 — 100 filas determinísticas. Se reemplaza por el Sheet
// real cambiando 1 línea en la config del conector google-sheets (ver §13).
import type { Contact } from "@/lib/connectors/types";

// Localidades del partido de Maipú, provincia de Buenos Aires + barrios
// ilustrativos de la cabecera. Datos de muestra (no padrón real).
const BARRIOS = [
  "Maipú Centro",
  "Las Armas",
  "Santo Domingo",
  "Barrio Norte",
  "Barrio Sur",
  "Estación",
  "Villa Mitre",
  "El Carmen",
];

const NOMBRES_F = ["María", "Ana", "Lucía", "Sofía", "Valentina", "Camila", "Julia", "Carla"];
const NOMBRES_M = ["Juan", "Carlos", "Diego", "Martín", "Pablo", "Lucas", "Mateo", "Nicolás"];
const APELLIDOS = [
  "González", "Rodríguez", "Fernández", "López", "Martínez", "Pérez",
  "García", "Sánchez", "Romero", "Sosa", "Torres", "Flores",
];

// PRNG determinístico (mulberry32) para que el mock sea estable entre builds.
function rng(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

export const mockPadron: Contact[] = Array.from({ length: 100 }, (_, i) => {
  const rand = rng(i + 1);
  const sexo = rand() < 0.5 ? "F" : "M";
  const nombre = pick(rand, sexo === "F" ? NOMBRES_F : NOMBRES_M);
  const apellido = pick(rand, APELLIDOS);
  const barrio = pick(rand, BARRIOS);
  const year = 1955 + Math.floor(rand() * 50); // 1955–2004
  const month = String(1 + Math.floor(rand() * 12)).padStart(2, "0");
  const day = String(1 + Math.floor(rand() * 28)).padStart(2, "0");
  const dni = String(20_000_000 + Math.floor(rand() * 25_000_000));
  const circuito = String(1 + Math.floor(rand() * 20)).padStart(2, "0");
  const mesa = String(1000 + Math.floor(rand() * 800));
  const tel = `+5492268${String(100000 + Math.floor(rand() * 899999))}`; // cód. área Maipú (BA): 2268

  return {
    dni,
    nombre,
    apellido,
    fecha_nac: `${year}-${month}-${day}`,
    sexo,
    domicilio: `Calle ${1 + Math.floor(rand() * 50)} N° ${100 + Math.floor(rand() * 900)}`,
    barrio,
    circuito,
    mesa,
    telefono: tel,
    email: `${nombre}.${apellido}${i}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^a-z0-9.]/g, "") + "@example.com", // ascii-only, sin tildes
  };
});
