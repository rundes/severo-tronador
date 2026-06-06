import Link from "next/link";
import { listTemplates } from "@/lib/templates";
import { filterFromParams } from "@/lib/segments";
import { decodeQuery } from "@/lib/segment-query";
import { FlowBuilder } from "@/components/flows/flow-builder";
import { crearFlow } from "../actions";

export const metadata = { title: "Nuevo flow · Tronador" };

export default async function NuevoFlowPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const filter = filterFromParams(params);
  const advancedQuery = params.q ? decodeQuery(params.q) : null;
  // Templates por canal — el cliente arma el form con todos juntos.
  const [emailT, waT, smsT, voiceT] = await Promise.all([
    listTemplates("email"),
    listTemplates("whatsapp"),
    listTemplates("sms"),
    listTemplates("voice"),
  ]);
  const templatesByChannel = {
    email: emailT.map((t) => ({ id: t.id, nombre: t.nombre })),
    whatsapp: waT.map((t) => ({ id: t.id, nombre: t.nombre })),
    sms: smsT.map((t) => ({ id: t.id, nombre: t.nombre })),
    voice: voiceT.map((t) => ({ id: t.id, nombre: t.nombre })),
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/campanas/flows"
        className="text-sm text-zinc-500 hover:underline"
      >
        ← Flows
      </Link>
      <header>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Nuevo drip flow
        </h1>
        <p className="mt-1 max-w-[60ch] text-sm text-zinc-500">
          Definí los steps en orden. El delay se cuenta desde el momento en
          que iniciás el flow. Las condiciones se evalúan al despachar cada
          step contra las respuestas a steps previos.
        </p>
      </header>

      {params.error === "validacion" && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30">
          Faltan datos. Cada step necesita canal, plantilla y delay.
        </div>
      )}

      <FlowBuilder
        action={crearFlow}
        templatesByChannel={templatesByChannel}
        defaultFilter={filter}
        advancedQuery={params.q ?? null}
        advancedQueryValid={Boolean(advancedQuery)}
      />
    </div>
  );
}
