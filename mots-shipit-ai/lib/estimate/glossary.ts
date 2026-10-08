const GLOSSARY_BASE_URL = "https://unisco.com/freight-glossary";
const TIMEOUT_MS = 5_000;
// Unisco answers unknown terms with HTTP 200 and its generic site description, not a 404.
const GENERIC_SITE_DESCRIPTION = /^UNIS is an asset based provider/i;

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

// KB3: Unisco Freight Glossary definition for a term. Missing terms are expected and
// return null; this never throws.
export async function lookupTerm(slug: string): Promise<{ term: string; definition: string; url: string } | null> {
  const url = `${GLOSSARY_BASE_URL}/${slug}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, next: { revalidate: 86_400 } });
    if (!res.ok) return null;
    const html = await res.text();
    const description =
      html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i)?.[1];
    if (!description) return null;
    const definition = decodeEntities(description).trim();
    if (GENERIC_SITE_DESCRIPTION.test(definition)) return null;
    return { term: slug.replace(/-/g, " "), definition: definition.slice(0, 400), url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
