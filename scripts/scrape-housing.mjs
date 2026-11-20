import { mkdir, writeFile } from "node:fs/promises";

const sources = [
  { id: "foundry-lofts", tier: "property_official", url: "https://www.foundryloftsannarbor.com/floorplans/" },
  { id: "verve-ann-arbor", tier: "property_official", url: "https://verveannarbor.com/floor-plans/" },
  { id: "six11", tier: "property_official", url: "https://livesix11.com/" },
  { id: "huron-towers", tier: "property_official", url: "https://htnikkitatest.prospectportal.com/ann-arbor/huron-towers/student/" },
  { id: "woodbury-gardens", tier: "property_official", url: "https://www.woodburygardens.com/Floor-plans.aspx" },
  { id: "courtyards", tier: "property_official", url: "https://courtyardsapts.prospectportal.com/ann-arbor/the-courtyards-apartments/student" },
  { id: "willowtree", tier: "property_official", url: "https://www.americancampus.com/Student-Apartments/MI/Ann-Arbor/Willowtree-Apartments-Tower/Floor-Plans" },
  { id: "landmark", tier: "listing_aggregator", url: "https://www.apartments.com/landmark-ann-arbor-mi/dtrlbjk/" },
  { id: "traver-ridge", tier: "listing_aggregator", url: "https://www.zillow.com/apartments/ann-arbor-mi/traver-ridge/CryKrT/" }
];

const pricePattern = /\$\s?\d{3,5}(?:,\d{3})?(?:\.\d{1,2})?/g;
const bedPattern = /\b(?:studio|\d+\s*(?:bed|bedroom)s?)\b/gi;
const bathPattern = /\b\d+(?:\.5)?\s*(?:bath|bathroom)s?\b/gi;
const squareFeetPattern = /\b\d{3,4}(?:,\d{3})?\s*(?:sq\.?\s*ft|square\s*feet|sf)\b/gi;
const amenityTerms = [
  "air conditioning", "accessible", "elevator", "furnished", "in-unit laundry",
  "parking", "pets allowed", "private bathroom", "roommate matching", "utilities included",
  "washer", "wheelchair"
];

function cleanText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.map((value) => value.toLowerCase()))];
}

function extract(source, html) {
  const text = cleanText(html);
  const lower = text.toLowerCase();
  return {
    id: source.id,
    source_tier: source.tier,
    source_url: source.url,
    retrieved_at: new Date().toISOString(),
    prices_found: unique(text.match(pricePattern) ?? []).slice(0, 100),
    bedroom_terms_found: unique(text.match(bedPattern) ?? []).slice(0, 30),
    bathroom_terms_found: unique(text.match(bathPattern) ?? []).slice(0, 30),
    square_feet_found: unique(text.match(squareFeetPattern) ?? []).slice(0, 30),
    amenities_found: amenityTerms.filter((term) => lower.includes(term)),
    text_sample: text.slice(0, 800),
    extraction_warning: "Candidate values require normalization and price-basis verification before model use."
  };
}

async function scrape(source) {
  try {
    const response = await fetch(source.url, {
      headers: {
        "user-agent": "CommonGround student housing research prototype/0.1 (educational, low-rate)"
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return extract(source, await response.text());
  } catch (error) {
    return {
      id: source.id,
      source_tier: source.tier,
      source_url: source.url,
      retrieved_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

const records = [];
for (const source of sources) {
  records.push(await scrape(source));
  await new Promise((resolve) => setTimeout(resolve, 750));
}

await mkdir("data/raw", { recursive: true });
await writeFile(
  "data/raw/latest.json",
  `${JSON.stringify({ generated_at: new Date().toISOString(), records }, null, 2)}\n`
);

const successes = records.filter((record) => !record.error).length;
console.log(`Collected ${successes}/${records.length} sources into data/raw/latest.json`);
