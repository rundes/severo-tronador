// Render del informe diario en el panel: mismo árbol de bloques que el mail
// y el PDF, con Tailwind y dark mode.
import { parseReportMarkdown, renderableSections, type Block, type Inline } from "@/lib/report-markdown";

function InlineText({ text }: { text: Inline[] }) {
  return (
    <>
      {text.map((x, i) =>
        x.t === "b" ? <strong key={i} className="font-semibold text-zinc-900 dark:text-zinc-100">{x.v}</strong>
        : x.t === "i" ? <em key={i}>{x.v}</em>
        : x.t === "code" ? <code key={i} className="whitespace-pre-wrap rounded bg-zinc-100 px-1 font-mono text-[12px] dark:bg-zinc-800">{x.v}</code>
        : <span key={i}>{x.v}</span>,
      )}
    </>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case "h":
      if (b.level === 1) return null;
      return b.level === 2
        ? <h3 className="mt-5 mb-2 border-l-2 border-[oklch(52%_0.13_255)] pl-2.5 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100"><InlineText text={b.text} /></h3>
        : <h4 className="mt-3 mb-1 text-[13px] font-semibold text-zinc-800 dark:text-zinc-200"><InlineText text={b.text} /></h4>;
    case "p":
      return <p className="mb-2 text-[13.5px] leading-relaxed text-zinc-700 dark:text-zinc-300"><InlineText text={b.text} /></p>;
    case "ul":
      return <ul className="mb-3 list-disc space-y-1 pl-5 text-[13.5px] text-zinc-700 dark:text-zinc-300">{b.items.map((it, i) => <li key={i}><InlineText text={it} /></li>)}</ul>;
    case "ol":
      return <ol className="mb-3 list-decimal space-y-1 pl-5 text-[13.5px] text-zinc-700 dark:text-zinc-300">{b.items.map((it, i) => <li key={i}><InlineText text={it} /></li>)}</ol>;
    case "quote":
      return <blockquote className="mb-3 border-l-2 border-zinc-300 bg-zinc-50 px-3 py-2 text-[13px] italic text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300"><InlineText text={b.text} /></blockquote>;
    case "table":
      return (
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead><tr>{b.header.map((h, i) => <th key={i} className="border-b border-zinc-200 py-1 pr-3 text-left text-[10px] uppercase tracking-[0.12em] text-zinc-500 dark:border-zinc-800">{h}</th>)}</tr></thead>
            <tbody>{b.rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} className="border-b border-zinc-100 py-1 pr-3 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr className="my-4 border-zinc-200 dark:border-zinc-800" />;
  }
}

export function ReportView({ markdown }: { markdown: string }) {
  const blocks = parseReportMarkdown(markdown);
  if (blocks.length === 0) return <p className="text-sm text-zinc-500">Informe sin contenido.</p>;
  return (
    <div>
      {renderableSections(blocks).map((sec, i) => {
        const t = sec.title.toLowerCase();
        const box = /resumen ejecutivo/.test(t)
          ? "rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
          : /sugerencia operativa/.test(t)
            ? "mt-4 rounded-md bg-[oklch(52%_0.13_255)]/8 p-4"
            : "";
        return (
          <section key={i} className={box}>
            {sec.title && (box
              ? <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">{sec.title}</div>
              : <h3 className="mt-5 mb-2 border-l-2 border-[oklch(52%_0.13_255)] pl-2.5 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">{sec.title}</h3>)}
            {sec.blocks.map((b, j) => <BlockView key={j} b={b} />)}
          </section>
        );
      })}
    </div>
  );
}
