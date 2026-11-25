"use client";

import { useEffect, useState } from "react";
import { resolveCity, searchCities } from "@/lib/cities";

export function CityField({
  label,
  value,
  onChange,
  onText,
}: {
  label: string;
  value: string;
  onChange: (city: string) => void;
  onText?: (text: string) => void;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  useEffect(() => setText(value), [value]);
  const results = searchCities(open ? text : "");

  function choose(city: string) {
    onChange(city);
    onText?.(city);
    setText(city);
    setOpen(false);
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-slate">{label}</label>
      <input
        className="min-h-12 w-full min-w-0 rounded-2xl border border-line bg-paper px-4 text-base"
        onBlur={() => {
          const resolved = resolveCity(text);
          if (resolved) choose(resolved);
          window.setTimeout(() => setOpen(false), 200);
        }}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          onText?.(next);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search a city"
        value={text}
      />
      {open ? (
        <ul className="mt-1 max-h-44 overflow-auto rounded-2xl border border-line bg-paper">
          {results.map((city) => (
            <li key={city.canonical}>
              <button
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-canvas"
                onPointerDown={(event) => {
                  event.preventDefault();
                  choose(city.canonical);
                }}
                type="button"
              >
                <span className="font-semibold">{city.canonical}</span>
                <span className="text-sm text-slate">{city.state}</span>
              </button>
            </li>
          ))}
          {results.length === 0 ? <li className="px-4 py-3 text-sm text-slate">No city matches that search.</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
