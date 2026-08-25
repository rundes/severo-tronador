// Ejemplo few-shot para lib/scenario-ai: cómo se ve un brief y qué escenario
// esperamos que la IA derive de él. Tomado del escenario FERRO (seed).
// Mantenerlo corto: entra en cada prompt de generación.

export const FERRO_EXAMPLE_BRIEF = `[2026-08-01 · operador] Cliente: agrupación de socios del Club Ferro Carril Oeste (Caballito, CABA). Se vienen las elecciones de comisión directiva, fecha tentativa 14 de septiembre de 2026.
[2026-08-03 · operador] Nos interesa la disputa entre el oficialismo (gestión actual) y las listas opositoras que piden recambio. Hay que seguir a la cuenta institucional del club y a los medios partidarios del club, y no confundir el estadio Etcheverri con predios de entrenamiento en otros municipios.
[2026-08-10 · operador] Ojo con atribuir cuentas anónimas a una lista sin evidencia.
[2026-08-12 · operador] Los lunes, miércoles y viernes de 19 a 20 sale "La voz verdolaga" por Radio del Club; conviene grabarlo.`;

export const FERRO_EXAMPLE_JSON = {
  tipo: "electoral",
  resumen:
    "Elección de comisión directiva de un club de CABA: conflicto oficialismo vs. listas de recambio. Se monitorea la institucional, los medios partidarios y la conversación de socios; las listas se cargan solo con evidencia.",
  keywords: [
    "Ferro Carril Oeste",
    "Caballito",
    "el Verdolaga",
    "elecciones Ferro",
    "socios Ferro",
    "comisión directiva Ferro",
    "lista Ferro",
    "asamblea Ferro",
  ],
  searchesA: ["Ferro elecciones oficialismo", "Ferro lista oficialista", "gestión Ferro"],
  searchesB: ["Ferro elecciones oposición", "Ferro lista opositora", "recambio Ferro"],
  accounts: [
    { handle: "ferrocarriloeste", platform: "instagram", category: "institucional", nota: "verificar handle" },
    { handle: "ferrooesteoficial", platform: "x", category: "institucional", nota: "verificar handle" },
  ],
  entidades: {
    "Ferro Carril Oeste": "Club deportivo de Caballito, CABA. Estadio Arquitecto Ricardo Etcheverri.",
    Etcheverri: "Estadio de Ferro en Caballito. No confundir con predios de entrenamiento en otro municipio.",
  },
  calendar: [{ label: "Elecciones Ferro (fecha a confirmar)", date: "2026-09-14" }],
  audio: [
    { kind: "radio", url: "https://stream.radiodelclub.com.ar/live", station: "Radio del Club", programa: "La voz verdolaga", days: [1, 3, 5], start: "19:00", end: "20:00", nota: "verificar url" },
  ],
};
