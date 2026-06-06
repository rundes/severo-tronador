"use client";

// Builder MVP de SegmentQuery (Plan 02 — F1.1). UI flat: combinador
// global (AND/OR) + lista de condiciones (field, op, value). Grupos
// anidados no se editan acá; el modelo los soporta para futuras
// iteraciones (importable via JSON desde una API).
//
// Estado: la query se serializa en el query param `q` (base64 URL-safe).
// "Aplicar" navega a /segmentos?q=...
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "@/components/ui/button";
import {
  FIELD_LABELS,
  OP_LABELS,
  OPS_BY_FIELD,
  encodeQuery,
  type SegmentCondition,
  type SegmentField,
  type SegmentGroup,
  type SegmentOp,
} from "@/lib/segment-query";

const FIELDS: SegmentField[] = [
  "sexo",
  "edad",
  "barrio",
  "circuito",
  "mesa",
  "healthScore",
  "healthBand",
  "respondedWithinDays",
  "notContactedDays",
  "hasEmail",
  "hasTelefono",
  "preferredChannel",
];

const inputCls =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

function defaultCondition(field: SegmentField): SegmentCondition {
  const op = OPS_BY_FIELD[field][0];
  return { type: "condition", field, op, value: defaultValue(field, op) };
}

function defaultValue(
  field: SegmentField,
  op: SegmentOp,
): SegmentCondition["value"] {
  if (op === "exists" || op === "not_exists") return null;
  if (field === "healthBand" && (op === "in" || op === "nin")) return [];
  if (
    field === "edad" ||
    field === "healthScore" ||
    field === "respondedWithinDays" ||
    field === "notContactedDays"
  )
    return 0;
  return "";
}

export function QueryBuilder({
  initial,
  barrios,
}: {
  initial?: SegmentGroup;
  barrios: string[];
}) {
  const router = useRouter();
  const [combinator, setCombinator] = useState<"AND" | "OR">(
    initial?.combinator ?? "AND",
  );
  const [negate, setNegate] = useState<boolean>(Boolean(initial?.negate));
  const [conditions, setConditions] = useState<SegmentCondition[]>(
    (initial?.conditions.filter((c): c is SegmentCondition => c.type === "condition") ??
      [defaultCondition("sexo")]),
  );

  function updateCondition(i: number, patch: Partial<SegmentCondition>) {
    setConditions((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch } as SegmentCondition;
      return next;
    });
  }

  function changeField(i: number, field: SegmentField) {
    const op = OPS_BY_FIELD[field][0];
    setConditions((prev) => {
      const next = [...prev];
      next[i] = { type: "condition", field, op, value: defaultValue(field, op) };
      return next;
    });
  }

  function changeOp(i: number, op: SegmentOp) {
    setConditions((prev) => {
      const next = [...prev];
      const cur = next[i];
      next[i] = { ...cur, op, value: defaultValue(cur.field, op) };
      return next;
    });
  }

  function addCondition() {
    setConditions((prev) => [...prev, defaultCondition("sexo")]);
  }

  function removeCondition(i: number) {
    setConditions((prev) => prev.filter((_, idx) => idx !== i));
  }

  function apply() {
    const query: SegmentGroup = {
      type: "group",
      combinator,
      negate,
      conditions: conditions.filter((c) => isValidCondition(c)),
    };
    if (query.conditions.length === 0) {
      router.push("/segmentos");
      return;
    }
    const encoded = encodeQuery(query);
    router.push(`/segmentos?q=${encoded}`);
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center gap-3 text-xs">
        <span className="font-medium uppercase tracking-wide text-zinc-400">
          Combinador
        </span>
        <button
          type="button"
          onClick={() => setCombinator((c) => (c === "AND" ? "OR" : "AND"))}
          className="rounded border border-zinc-300 px-2 py-1 font-mono text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          {combinator}
        </button>
        <label className="ml-auto flex items-center gap-1 text-zinc-500">
          <input
            type="checkbox"
            checked={negate}
            onChange={(e) => setNegate(e.target.checked)}
          />
          NOT (excluir)
        </label>
      </div>

      <div className="space-y-1">
        {conditions.map((c, i) => (
          <ConditionRow
            key={i}
            cond={c}
            barrios={barrios}
            onChangeField={(f) => changeField(i, f)}
            onChangeOp={(op) => changeOp(i, op)}
            onChangeValue={(v) => updateCondition(i, { value: v })}
            onRemove={() => removeCondition(i)}
            canRemove={conditions.length > 1}
          />
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={addCondition}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          + Condición
        </button>
        <button
          type="button"
          onClick={apply}
          className={buttonClass("accent")}
        >
          Aplicar query
        </button>
        <button
          type="button"
          onClick={() => router.push("/segmentos")}
          className="rounded px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-900"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}

function isValidCondition(c: SegmentCondition): boolean {
  if (c.op === "exists" || c.op === "not_exists") return true;
  if (Array.isArray(c.value)) return c.value.length > 0;
  return c.value !== "" && c.value != null;
}

function ConditionRow({
  cond,
  barrios,
  onChangeField,
  onChangeOp,
  onChangeValue,
  onRemove,
  canRemove,
}: {
  cond: SegmentCondition;
  barrios: string[];
  onChangeField: (f: SegmentField) => void;
  onChangeOp: (op: SegmentOp) => void;
  onChangeValue: (v: SegmentCondition["value"]) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={cond.field}
        onChange={(e) => onChangeField(e.target.value as SegmentField)}
        className={inputCls}
      >
        {FIELDS.map((f) => (
          <option key={f} value={f}>
            {FIELD_LABELS[f]}
          </option>
        ))}
      </select>
      <select
        value={cond.op}
        onChange={(e) => onChangeOp(e.target.value as SegmentOp)}
        className={inputCls}
      >
        {OPS_BY_FIELD[cond.field].map((op) => (
          <option key={op} value={op}>
            {OP_LABELS[op]}
          </option>
        ))}
      </select>
      <ValueInput cond={cond} barrios={barrios} onChange={onChangeValue} />
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-zinc-400 hover:text-red-600"
          aria-label="Quitar"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function ValueInput({
  cond,
  barrios,
  onChange,
}: {
  cond: SegmentCondition;
  barrios: string[];
  onChange: (v: SegmentCondition["value"]) => void;
}) {
  const { field, op, value } = cond;
  if (op === "exists" || op === "not_exists") {
    return <span className="text-xs text-zinc-400 italic">—</span>;
  }
  if (field === "sexo") {
    return (
      <select
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      >
        <option value="">—</option>
        <option value="F">F</option>
        <option value="M">M</option>
      </select>
    );
  }
  if (field === "preferredChannel") {
    return (
      <select
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      >
        <option value="">—</option>
        <option value="email">📧 Email</option>
        <option value="whatsapp">💬 WhatsApp</option>
        <option value="sms">📱 SMS</option>
        <option value="voice">☎️ Voz</option>
      </select>
    );
  }
  if (field === "barrio") {
    return (
      <select
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      >
        <option value="">—</option>
        {barrios.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
    );
  }
  if (field === "healthBand" && (op === "in" || op === "nin")) {
    const active = new Set(Array.isArray(value) ? (value as string[]) : []);
    function toggle(band: string) {
      const next = new Set(active);
      if (next.has(band)) next.delete(band);
      else next.add(band);
      onChange(Array.from(next));
    }
    return (
      <div className="flex gap-2 text-xs">
        {(["green", "yellow", "red"] as const).map((b) => (
          <label key={b} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={active.has(b)}
              onChange={() => toggle(b)}
            />
            {b === "green" ? "🟢" : b === "yellow" ? "🟡" : "🔴"}
          </label>
        ))}
      </div>
    );
  }
  if (
    field === "edad" ||
    field === "healthScore" ||
    field === "respondedWithinDays" ||
    field === "notContactedDays"
  ) {
    return (
      <input
        type="number"
        value={typeof value === "number" ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${inputCls} w-20`}
      />
    );
  }
  // circuito / mesa / barrio fallback
  return (
    <input
      type="text"
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    />
  );
}
