"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { z } from "zod";
import {
  createFlow,
  deleteFlow,
  startFlow,
  type ConditionKind,
} from "@/lib/flows";
import { logAudit } from "@/lib/audit";
import { ChannelEnum, SegmentFilterSchema } from "@/lib/schemas";
import { decodeQuery } from "@/lib/segment-query";
import { requireMember } from "@/lib/workspace";

const ConditionEnum = z.enum([
  "always",
  "if_no_response_to_prev",
  "if_response_to_prev",
]);

const StepSchema = z.object({
  delay_days: z.number().int().min(0).max(365),
  channel: ChannelEnum,
  template_id: z.string().min(1),
  condition_kind: ConditionEnum,
});

const HourOptional = z.preprocess(
  (v) => {
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  },
  z.number().int().min(0).max(23).optional(),
);

const FlowSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  steps: z.array(StepSchema).min(1).max(20),
  send_window_start_hour: HourOptional,
  send_window_end_hour: HourOptional,
});

export async function crearFlow(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const channels = formData.getAll("step_channel").map(String);
  const templates = formData.getAll("step_template").map(String);
  const delays = formData
    .getAll("step_delay")
    .map((v) => Number(String(v)))
    .map((n) => (Number.isFinite(n) ? n : 0));
  const conditions = formData.getAll("step_condition").map(String);
  const steps = channels.map((channel, i) => ({
    delay_days: delays[i] ?? 0,
    channel,
    template_id: templates[i] ?? "",
    condition_kind: conditions[i] ?? "always",
  }));

  // Segmento: usa el mismo input que /campanas. Soporta `q` (advanced) o
  // filtros planos.
  const qParam = String(formData.get("q") ?? "");
  const advancedQuery = qParam ? decodeQuery(qParam) : null;
  const flatRaw = {
    sexo: String(formData.get("sexo") ?? ""),
    edadMin: String(formData.get("edadMin") ?? ""),
    edadMax: String(formData.get("edadMax") ?? ""),
    barrio: String(formData.get("barrio") ?? ""),
    healthMin: String(formData.get("healthMin") ?? ""),
  };
  const parsedFilter = advancedQuery
    ? null
    : SegmentFilterSchema.safeParse(flatRaw);

  const parsed = FlowSchema.safeParse({
    nombre,
    steps,
    send_window_start_hour: formData.get("send_window_start_hour"),
    send_window_end_hour: formData.get("send_window_end_hour"),
  });
  if (!parsed.success) redirect("/campanas/flows/nueva?error=validacion");

  const { id: projectId } = await requireMember("editor");
  const session = await auth();
  const segment_filter =
    advancedQuery ?? (parsedFilter && parsedFilter.success ? parsedFilter.data : {});

  const flow = await createFlow(projectId, {
    nombre: parsed.data.nombre,
    segment_filter,
    steps: parsed.data.steps.map((s) => ({
      delay_days: s.delay_days,
      channel: s.channel,
      template_id: s.template_id,
      condition_kind: s.condition_kind as ConditionKind,
      position: 0,
    })),
    created_by: session?.user?.email ?? undefined,
    send_window_start_hour: parsed.data.send_window_start_hour ?? null,
    send_window_end_hour: parsed.data.send_window_end_hour ?? null,
  });
  await logAudit({
    action: "flow.create",
    actor: session?.user?.email ?? null,
    entity_type: "flow",
    entity_id: flow.id,
    details: { nombre: flow.nombre, steps: flow.steps.length },
  });
  revalidatePath("/campanas/flows");
  redirect("/campanas/flows?creado=1");
}

export async function iniciarFlow(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const { id: projectId } = await requireMember("editor");
  const res = await startFlow(projectId, id);
  if (!res.ok) {
    redirect(`/campanas/flows?error=${res.reason}`);
  }
  const session = await auth();
  await logAudit({
    action: "flow.start",
    actor: session?.user?.email ?? null,
    entity_type: "flow",
    entity_id: id,
    details: { enqueued: res.enqueued },
  });
  revalidatePath("/campanas/flows");
  redirect(`/campanas/flows?iniciado=1`);
}

export async function borrarFlow(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const { id: projectId } = await requireMember("editor");
  await deleteFlow(projectId, id);
  const session = await auth();
  await logAudit({
    action: "flow.delete",
    actor: session?.user?.email ?? null,
    entity_type: "flow",
    entity_id: id,
  });
  revalidatePath("/campanas/flows");
}
