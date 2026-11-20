import { mkdir, writeFile } from "node:fs/promises";

const apiKey = process.env.FIRECRAWL_API_KEY;
if (!apiKey) {
  console.error("FIRECRAWL_API_KEY is required. Add it to your shell environment; never commit it.");
  process.exit(1);
}

const searchQueries = [
  "Ann Arbor MI apartments for rent",
  "Ann Arbor student apartments University of Michigan",
  "Ann Arbor low rise apartment rent",
  "Ann Arbor high rise apartment rent",
  "Ann Arbor North Campus apartments rent",
  "Ann Arbor Central Campus apartments rent",
  "Ann Arbor affordable income restricted apartments",
  "Ann Arbor cooperative student housing",
  "site:offcampushousing.umich.edu/city/ann-arbor-mi/listing",
  "site:apartments.com/ann-arbor-mi apartments rent",
  "site:zillow.com/ann-arbor-mi apartments rent",
  "site:reddit.com/r/uofm Ann Arbor housing apartment rent"
];

const mapTargets = [
  "https://offcampushousing.umich.edu/listing",
  "https://www.annarboroffcampus.com/housing",
  "https://www.mckinley.com/apartments/michigan/ann-arbor",
  "https://www.icc.coop/housing/our-houses"
];

async function post(path, body) {
  const response = await fetch(`https://api.firecrawl.dev/v2/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path} failed with ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

const searches = [];
for (const query of searchQueries) {
  try {
    searches.push({
      query,
      result: await post("search", {
        query,
        limit: 20,
        sources: [{ type: "web" }],
        scrapeOptions: { formats: ["markdown"], onlyMainContent: true }
      })
    });
  } catch (error) {
    searches.push({ query, error: error instanceof Error ? error.message : String(error) });
  }
}

const maps = [];
for (const url of mapTargets) {
  try {
    maps.push({ url, result: await post("map", { url, limit: 5000 }) });
  } catch (error) {
    maps.push({ url, error: error instanceof Error ? error.message : String(error) });
  }
}

await mkdir("data/firecrawl", { recursive: true });
await writeFile("data/firecrawl/discovery.json", `${JSON.stringify({
  generated_at: new Date().toISOString(),
  searches,
  maps
}, null, 2)}\n`);

console.log(`Saved ${searches.length} searches and ${maps.length} site maps to data/firecrawl/discovery.json`);
