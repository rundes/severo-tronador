import { importarCsv } from "./actions";
import { dbConfigured } from "@/lib/db/supabase";
import { padronCount } from "@/lib/db/padron";

export const metadata = { title: "Padrón · Severo Tronador" };

export default async function PadronPage() {
  const count = dbConfigured() ? await padronCount() : 0;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Padrón</h1>
      {!dbConfigured() && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Supabase no configurado — usando padrón mock de dev. Cargá las env vars de Supabase para persistir el padrón real.
        </p>
      )}
      <p className="text-sm text-zinc-500">{count} contactos cargados.</p>
      <form action={importarCsv} className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="text-sm font-medium">Importar CSV</div>
        <p className="text-xs text-zinc-500">Encabezados: dni, nombre, apellido, fecha_nac, sexo, domicilio, barrio, circuito, mesa, telefono, email.</p>
        <input type="file" name="csv" accept=".csv" required className="text-sm" />
        <button type="submit" className="block rounded bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">Importar</button>
      </form>
      <p className="text-xs text-zinc-400">Conectar un Google Sheet como fuente: ver el conector Google Sheets en /conectores (se importa a la misma tabla).</p>
    </div>
  );
}
