"use client";

// Wrapper que carga el MapPicker de Leaflet sin SSR (window/L no existen
// server-side). El inner component vive en `map-picker-inner.tsx` para
// que el dynamic import sólo traiga el chunk de leaflet cuando se renderiza.
//
// Plan 03 F3: reemplaza el SVG estático por OpenStreetMap real con marker
// draggeable, círculo de radio y buscador Nominatim.
import dynamic from "next/dynamic";

const MapPickerInner = dynamic(() => import("./map-picker-inner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[260px] items-center justify-center rounded-md border border-zinc-200 text-xs text-zinc-400 dark:border-zinc-700">
      Cargando mapa…
    </div>
  ),
});

export function MapPicker({
  defaultLat,
  defaultLng,
  defaultRadio,
}: {
  defaultLat: number | null;
  defaultLng: number | null;
  defaultRadio: number | null;
}) {
  return (
    <MapPickerInner
      defaultLat={defaultLat}
      defaultLng={defaultLng}
      defaultRadio={defaultRadio}
    />
  );
}
