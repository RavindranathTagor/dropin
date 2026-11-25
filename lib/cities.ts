import { INDIA_CITY_ROWS } from "@/lib/india-cities";

export type City = {
  canonical: string;
  state: string;
  lat: number;
  lng: number;
  aliases: string[];
};

export const CITIES: City[] = INDIA_CITY_ROWS.map(([canonical, state, lat, lng, aliases]) => ({
  canonical,
  state,
  lat,
  lng,
  aliases: [canonical.toLowerCase(), ...(aliases || [])],
}));

const POPULAR = ["Bengaluru", "Mangaluru", "Mysuru", "Udupi", "Hubballi", "Goa", "Hyderabad", "Chennai", "Kochi", "Pune", "Mumbai", "Coimbatore"];

export function searchCities(text: string) {
  const query = text.trim().toLowerCase();
  if (!query) {
    return POPULAR.flatMap((name) => {
      const city = CITIES.find((item) => item.canonical === name);
      return city ? [city] : [];
    }).slice(0, 8);
  }
  const ranked = CITIES.filter((city) => {
    if (!query) return true;
    return (
      city.canonical.toLowerCase().includes(query) ||
      city.state.toLowerCase().includes(query) ||
      city.aliases.some((alias) => alias.toLowerCase().includes(query))
    );
  });
  ranked.sort((a, b) => {
    const aStart = a.canonical.toLowerCase().startsWith(query) ? 0 : 1;
    const bStart = b.canonical.toLowerCase().startsWith(query) ? 0 : 1;
    return aStart - bStart || a.canonical.localeCompare(b.canonical);
  });
  return ranked.slice(0, query ? 12 : 8);
}

export function resolveCity(text: string) {
  const query = text.trim().toLowerCase();
  if (!query) return null;
  const exact = CITIES.find(
    (city) => city.canonical.toLowerCase() === query || city.aliases.some((alias) => alias.toLowerCase() === query),
  );
  if (exact) return exact.canonical;
  const names = [
    ...new Set(
      CITIES.filter(
        (city) =>
          city.canonical.toLowerCase().startsWith(query) ||
          city.aliases.some((alias) => alias.toLowerCase().startsWith(query)),
      ).map((city) => city.canonical),
    ),
  ];
  return names.length === 1 ? names[0] : null;
}

export function findCities(text: string) {
  const haystack = text.toLowerCase();
  const hits: { canonical: string; index: number }[] = [];
  for (const city of CITIES) {
    for (const alias of city.aliases) {
      const index = haystack.indexOf(alias.toLowerCase());
      if (index >= 0) hits.push({ canonical: city.canonical, index });
    }
  }
  hits.sort((a, b) => a.index - b.index || b.canonical.length - a.canonical.length);
  const unique: { canonical: string; index: number }[] = [];
  for (const hit of hits) {
    if (!unique.some((item) => item.canonical === hit.canonical)) unique.push(hit);
  }
  return unique;
}
