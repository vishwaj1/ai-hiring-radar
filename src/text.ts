const NAMED: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'",
  "&nbsp;": " ", "&rsquo;": "'", "&lsquo;": "'", "&ldquo;": '"', "&rdquo;": '"',
  "&ndash;": "-", "&mdash;": "-", "&hellip;": "...",
};

function decodeEntities(s: string): string {
  return s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|[a-z]+);/gi, (match, dec?: string, hex?: string) => {
    try {
      if (dec) return String.fromCodePoint(Number(dec));
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
    } catch {
      return match;
    }
    return NAMED[match.toLowerCase()] ?? match;
  });
}

/** Greenhouse returns descriptions as HTML-escaped HTML; Ashby gives plain text. Handle both. */
export function htmlToText(input: string): string {
  let s = input;
  if (/&lt;\s*\/?\w+/i.test(s) && !/<\s*\/?\w+/.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|li|ul|ol|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A short lead-in, cut at a sentence or word boundary. Never the whole description. */
export function excerpt(text: string, max = 600): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const slice = flat.slice(0, max);
  const sentence = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  const cut = sentence > max * 0.5 ? sentence + 1 : slice.lastIndexOf(" ");
  return `${slice.slice(0, cut > 0 ? cut : max).trim()}...`;
}
