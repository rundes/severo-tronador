"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix de iconos default de Leaflet en bundlers tipo webpack/turbopack — los
// URLs apuntan a `marker-icon.png` relativos que se rompen sin import
// explícito. Re-asignamos al CDN público de leafletjs.com.
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// react-leaflet componentes vienen dinámicos para no romper SSR (acceden a
// window). Como este file ya es client, importamos directo.
import {
  Circle,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

const inputCls =
  "rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100";

interface NominatimHit {
  display_name: string;
  lat: string;
  lon: string;
}

export interface MapPickerInnerProps {
  defaultLat: number | null;
  defaultLng: number | null;
  defaultRadio: number | null;
}

// Default: centro AR (~Argentina central) cuando no hay pin.
const AR_CENTER: [number, number] = [-38.4, -63.6];
const DEFAULT_ZOOM = 5;
const PINNED_ZOOM = 11;

export default function MapPickerInner({
  defaultLat,
  defaultLng,
  defaultRadio,
}: MapPickerInnerProps) {
  const [lat, setLat] = useState<string>(
    defaultLat != null ? String(defaultLat) : "",
  );
  const [lng, setLng] = useState<string>(
    defaultLng != null ? String(defaultLng) : "",
  );
  const [radio, setRadio] = useState<string>(
    defaultRadio != null ? String(defaultRadio) : "25",
  );
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<NominatimHit[]>([]);
  const [searching, setSearching] = useState(false);

  const numLat = Number(lat);
  const numLng = Number(lng);
  const hasPin =
    !Number.isNaN(numLat) &&
    !Number.isNaN(numLng) &&
    lat !== "" &&
    lng !== "" &&
    numLat >= -90 &&
    numLat <= 90 &&
    numLng >= -180 &&
    numLng <= 180;

  const radioNum = Number(radio);
  const radioMeters =
    !Number.isNaN(radioNum) && radioNum > 0 ? radioNum * 1000 : 0;

  // Geolocate button.
  function locate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(5));
        setLng(pos.coords.longitude.toFixed(5));
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000 },
    );
  }

  // Nominatim search debounced. setState lazy adentro del setTimeout para
  // no caer en regla react-hooks/set-state-in-effect.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 3) {
      debounceRef.current = setTimeout(() => setHits([]), 0);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(q)}`,
          { headers: { "Accept-Language": "es" } },
        );
        if (res.ok) {
          const data = (await res.json()) as NominatimHit[];
          setHits(data);
        } else {
          setHits([]);
        }
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function pickHit(h: NominatimHit) {
    setLat(Number(h.lat).toFixed(5));
    setLng(Number(h.lon).toFixed(5));
    setQuery(h.display_name.split(",")[0]);
    setHits([]);
  }

  const center = useMemo<[number, number]>(
    () => (hasPin ? [numLat, numLng] : AR_CENTER),
    [hasPin, numLat, numLng],
  );

  return (
    <div className="space-y-3">
      {/* Búsqueda Nominatim */}
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar zona, calle, ciudad…"
          className={`${inputCls} w-full`}
        />
        {searching && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-zinc-400">
            …
          </span>
        )}
        {hits.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-[1000] mt-1 max-h-60 overflow-y-auto rounded-md border border-zinc-300 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            {hits.map((h, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => pickHit(h)}
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <span className="truncate">{h.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Inputs lat/lng/radio */}
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Lat
          <input
            name="lat"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="-34.6037"
            inputMode="decimal"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Lng
          <input
            name="lng"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            placeholder="-58.3816"
            inputMode="decimal"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Radio (km)
          <input
            name="radioKm"
            type="number"
            min={0}
            max={5000}
            value={radio}
            onChange={(e) => setRadio(e.target.value)}
            className={inputCls}
          />
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={locate}
          className="rounded border border-zinc-300 px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          usar mi ubicación
        </button>
      </div>

      {/* Mapa Leaflet */}
      <div className="h-[260px] overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700">
        <MapContainer
          center={center}
          zoom={hasPin ? PINNED_ZOOM : DEFAULT_ZOOM}
          scrollWheelZoom
          style={{ width: "100%", height: "100%" }}
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <MapClickHandler
            onClick={(pos) => {
              setLat(pos.lat.toFixed(5));
              setLng(pos.lng.toFixed(5));
            }}
          />
          {hasPin && (
            <>
              <RecenterOnPin lat={numLat} lng={numLng} />
              <Marker
                position={[numLat, numLng]}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const m = e.target as L.Marker;
                    const p = m.getLatLng();
                    setLat(p.lat.toFixed(5));
                    setLng(p.lng.toFixed(5));
                  },
                }}
              />
              {radioMeters > 0 && (
                <Circle
                  center={[numLat, numLng]}
                  radius={radioMeters}
                  pathOptions={{
                    color: "oklch(60% 0.18 30)",
                    fillColor: "oklch(60% 0.18 30)",
                    fillOpacity: 0.12,
                    weight: 1.5,
                  }}
                />
              )}
            </>
          )}
        </MapContainer>
      </div>

      <p className="text-[10px] uppercase tracking-wider text-zinc-400">
        Click en el mapa fija pin · arrastrá el marker para ajustar · tiles
        de OpenStreetMap
      </p>
    </div>
  );
}

// Click handler interno.
function MapClickHandler({
  onClick,
}: {
  onClick: (p: { lat: number; lng: number }) => void;
}) {
  useMapEvents({
    click(e) {
      onClick(e.latlng);
    },
  });
  return null;
}

// Recentra el mapa cuando lat/lng cambian (search, inputs).
function RecenterOnPin({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), PINNED_ZOOM), {
      animate: true,
    });
  }, [lat, lng, map]);
  return null;
}
