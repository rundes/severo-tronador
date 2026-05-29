"use client";

// Picker de coordenadas MVP: inputs numéricos editables + botón
// "geolocalizar" usando navigator.geolocation. Sin map tile real por
// ahora — pendiente integrar leaflet en una iteración siguiente.
//
// Bonus: muestra una mini-tira gráfica con la posición relativa dentro
// del bounding box AR (-55..-21 lat, -73..-53 lng) para feedback visual.
import { useState } from "react";

const AR_BOUNDS = { latMin: -55, latMax: -21, lngMin: -73, lngMax: -53 };
const inputCls =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100";

export function MapPicker({
  defaultLat,
  defaultLng,
  defaultRadio,
}: {
  defaultLat: number | null;
  defaultLng: number | null;
  defaultRadio: number | null;
}) {
  const [lat, setLat] = useState<string>(
    defaultLat != null ? String(defaultLat) : "",
  );
  const [lng, setLng] = useState<string>(
    defaultLng != null ? String(defaultLng) : "",
  );

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

  function clickMap(e: React.MouseEvent<SVGSVGElement>) {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const newLng = AR_BOUNDS.lngMin + x * (AR_BOUNDS.lngMax - AR_BOUNDS.lngMin);
    const newLat = AR_BOUNDS.latMax - y * (AR_BOUNDS.latMax - AR_BOUNDS.latMin);
    setLat(newLat.toFixed(5));
    setLng(newLng.toFixed(5));
  }

  const numLat = Number(lat);
  const numLng = Number(lng);
  const hasPin =
    !Number.isNaN(numLat) &&
    !Number.isNaN(numLng) &&
    lat !== "" &&
    lng !== "" &&
    numLat >= AR_BOUNDS.latMin &&
    numLat <= AR_BOUNDS.latMax &&
    numLng >= AR_BOUNDS.lngMin &&
    numLng <= AR_BOUNDS.lngMax;
  const pinX = hasPin
    ? ((numLng - AR_BOUNDS.lngMin) / (AR_BOUNDS.lngMax - AR_BOUNDS.lngMin)) * 100
    : 0;
  const pinY = hasPin
    ? ((AR_BOUNDS.latMax - numLat) / (AR_BOUNDS.latMax - AR_BOUNDS.latMin)) * 100
    : 0;

  return (
    <div className="space-y-3">
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
            defaultValue={defaultRadio ?? ""}
            placeholder="25"
            className={inputCls}
          />
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
          <span>Mapa (Argentina) · click para fijar pin</span>
          <button
            type="button"
            onClick={locate}
            className="rounded border border-zinc-300 px-2 py-0.5 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            usar mi ubicación
          </button>
        </div>
        <svg
          onClick={clickMap}
          viewBox="0 0 200 340"
          className="block w-full max-w-[180px] cursor-crosshair rounded border border-zinc-200 bg-[oklch(95%_0.008_200)] dark:border-zinc-700 dark:bg-zinc-900"
          aria-label="Mapa simplificado de Argentina para fijar pin"
        >
          {/* Silueta esquemática de Argentina (path simplificado). */}
          <path
            d="M115 5 L130 28 L140 50 L150 72 L155 95 L160 120 L155 145 L150 168 L143 190 L138 210 L125 230 L115 245 L100 260 L88 275 L78 290 L70 305 L60 318 L50 330 L42 305 L48 280 L55 255 L60 230 L65 205 L70 180 L72 155 L70 130 L72 105 L78 80 L88 55 L100 30 Z"
            fill="oklch(85% 0.015 250)"
            stroke="oklch(60% 0.04 250)"
            strokeWidth="0.8"
          />
          {hasPin && (
            <>
              <circle
                cx={(pinX / 100) * 200}
                cy={(pinY / 100) * 340}
                r="3.5"
                fill="oklch(60% 0.18 30)"
                stroke="oklch(96% 0.01 80)"
                strokeWidth="1.5"
              />
              <circle
                cx={(pinX / 100) * 200}
                cy={(pinY / 100) * 340}
                r="8"
                fill="oklch(60% 0.18 30)"
                fillOpacity="0.2"
              />
            </>
          )}
        </svg>
        {hasPin && (
          <p className="font-mono text-[10px] text-zinc-500">
            pin: {numLat.toFixed(4)}, {numLng.toFixed(4)}
          </p>
        )}
      </div>
    </div>
  );
}
