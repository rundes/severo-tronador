"""
Backfill: re-aplica clean_text() a los listening_items ya guardados por el
worker de Facebook (connector_id = fb-pages).

Motivo: hasta el fix de _UI_TAIL, textos como "… 1w Like Reply See
translation 5" quedaron guardados enteros y "like/reply/see" aparecían como
palabras clave en /escucha. El upsert del worker solo pisa los posts que
vuelve a ver, así que los viejos hay que limpiarlos una vez a mano.

Uso:
  python infra/fb-worker/backfill_clean.py            # dry-run: muestra diffs
  python infra/fb-worker/backfill_clean.py --apply    # escribe en la DB

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (mismos que worker.py).
"""
import sys

from worker import clean_text, rest


def main() -> None:
    apply = "--apply" in sys.argv
    r = rest("GET", "listening_items?connector_id=eq.fb-pages&select=id,text&limit=5000")
    r.raise_for_status()
    rows = r.json()
    changed = [(row["id"], row["text"], clean_text(row["text"])) for row in rows]
    changed = [c for c in changed if c[1] != c[2]]
    print(f"{len(rows)} items fb-pages · {len(changed)} a limpiar")
    for _, before, after in changed[:15]:
        print(f"  - {before[-70:]!r}\n  + {after[-70:]!r}")
    if not apply:
        print("dry-run (pasar --apply para escribir)")
        return
    errors = 0
    for item_id, _, after in changed:
        # Mismo umbral que extract_comments: un comentario que era solo
        # "2y" (timestamp) no es contenido → se borra en vez de dejar "".
        if len(after) < 5:
            resp = rest("DELETE", f"listening_items?id=eq.{item_id}")
        else:
            resp = rest("PATCH", f"listening_items?id=eq.{item_id}", json={"text": after})
        if resp.status_code >= 300:
            errors += 1
            print(f"  error {resp.status_code} en {item_id}: {resp.text[:120]}", file=sys.stderr)
    print(f"actualizados {len(changed) - errors} · errores {errors}")


if __name__ == "__main__":
    main()
