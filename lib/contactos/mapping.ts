// Campos de Contacto y adivinanza de columnas, compartidos entre el mapper
// server-rendered (sheet configurado) y el mapper client del Picker de Drive.
// Sin dependencias de servidor para poder usarse en ambos.

export const CONTACT_FIELDS: {
  key: string;
  label: string;
  required?: boolean;
}[] = [
  { key: "dni", label: "DNI / Identificador único", required: true },
  { key: "nombre", label: "Nombre" },
  { key: "apellido", label: "Apellido" },
  { key: "email", label: "Email" },
  { key: "telefono", label: "Teléfono" },
  { key: "fecha_nac", label: "Fecha de nacimiento" },
  { key: "sexo", label: "Sexo" },
  { key: "domicilio", label: "Domicilio" },
  { key: "barrio", label: "Barrio" },
  { key: "circuito", label: "Circuito electoral" },
  { key: "mesa", label: "Mesa electoral" },
  { key: "x_handle", label: "Cuenta de X (Twitter)" },
  { key: "afiliacion", label: "Afiliación política" },
];

export function bestGuess(field: string, headers: string[]): string {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/g, "");
  const target = normalize(field);
  const aliases: Record<string, string[]> = {
    dni: ["dni", "documento", "documentonumero", "identificador", "id"],
    nombre: ["nombre", "firstname", "first", "given", "name"],
    apellido: ["apellido", "lastname", "last", "family", "surname"],
    email: ["email", "correo", "mail", "correoelectronico"],
    telefono: ["telefono", "phone", "tel", "celular", "movil", "mobile"],
    fecha_nac: ["fechanac", "nacimiento", "birth", "fechanacimiento"],
    domicilio: ["domicilio", "direccion", "address", "calle"],
    circuito: ["circuito"],
    mesa: ["mesa"],
    sexo: ["sexo", "genero", "gender", "sex"],
    barrio: ["barrio", "neighborhood", "zona"],
    x_handle: [
      "xhandle",
      "twitter",
      "twitterhandle",
      "twitteruser",
      "twitterusername",
      "usuariox",
      "usuariotwitter",
      "handlex",
      "arroba",
    ],
    afiliacion: [
      "afiliacion",
      "afiliacionpolitica",
      "partido",
      "partidopolitico",
      "political",
      "politicalaffiliation",
      "espacio",
      "fuerza",
    ],
  };
  const aliasList = (aliases[field] ?? [target]).map(normalize);
  for (const h of headers) {
    const n = normalize(h);
    for (const a of aliasList) if (n === a) return h;
  }
  for (const h of headers) {
    const n = normalize(h);
    for (const a of aliasList) if (n.includes(a)) return h;
  }
  return "";
}
