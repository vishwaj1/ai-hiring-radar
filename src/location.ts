// Locations are free text written by each company. This is a pragmatic matcher,
// not a geocoder: it handles the aliases people actually type and says so.

const US_STATES = new Set(
  (
    "AL AK AZ AR CA CO CT DC FL GA HI IA ID IL KS KY LA MA MD ME MI MN MO MS MT NC " +
    "ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY"
  ).split(" "),
);
// DE and IN are left out on purpose: they are also country codes (Germany, India).

const US_CITIES = [
  "san francisco", "new york", "seattle", "austin", "boston", "chicago",
  "los angeles", "denver", "washington", "palo alto", "mountain view",
  "menlo park", "sunnyvale", "san jose", "oakland", "brooklyn", "atlanta",
  "miami", "dallas", "houston", "portland", "san diego", "philadelphia",
];

const ALIASES: Record<string, string[]> = {
  sf: ["san francisco", "south san francisco"],
  "bay area": ["san francisco", "palo alto", "mountain view", "menlo park", "sunnyvale", "san jose", "oakland"],
  nyc: ["new york", "brooklyn"],
  "new york city": ["new york", "brooklyn"],
  la: ["los angeles"],
  dc: ["washington"],
  uk: ["united kingdom", "london"],
  emea: ["london", "paris", "munich", "zurich", "madrid", "dublin", "amsterdam", "stockholm", "europe", "united kingdom", "emea", "dubai", "abu dhabi", "middle east"],
  apac: ["singapore", "tokyo", "japan", "sydney", "australia", "seoul", "korea", "india", "bengaluru", "bangalore", "apac"],
};

export function isUS(location: string): boolean {
  const lower = location.toLowerCase();
  if (/united states|\busa\b|\bu\.s\./.test(lower)) return true;
  if (/\bUS\b/.test(location)) return true; // e.g. "Remote (US)"
  const stateMatch = location.match(/[,(]\s*([A-Z]{2})\b/);
  if (stateMatch?.[1] && US_STATES.has(stateMatch[1])) return true;
  return US_CITIES.some((c) => lower.includes(c));
}

export function matchesLocation(location: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const loc = location.toLowerCase();
  const alternatives = q.split(/\s*(?:\||\/|\bor\b)\s*/).filter((a) => a !== "");
  return alternatives.some((alt) => {
    if (alt === "us" || alt === "usa" || alt === "united states" || alt === "u.s.") {
      return isUS(location);
    }
    const aliased = ALIASES[alt];
    if (aliased) return aliased.some((term) => loc.includes(term));
    return loc.includes(alt);
  });
}
