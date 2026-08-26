// Nombre de archivo del PDF del informe: informe-<proyecto>-<yyyy-mm-dd>.pdf
export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "proyecto";
}

export function reportFilename(project: string, atIso: string): string {
  return `informe-${slugify(project)}-${atIso.slice(0, 10)}.pdf`;
}
