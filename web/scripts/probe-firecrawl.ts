// One-page probe: shows raw Firecrawl JSON output and credit cost. Usage: node --env-file=.env.local scripts/probe-firecrawl.ts <url>
import { EXTRACTION_PROMPT, EXTRACTION_SCHEMA } from "../src/lib/housing/extraction-schema.ts";
const url = process.argv[2];
const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, "content-type": "application/json" },
  body: JSON.stringify({ url, onlyMainContent: false, formats: ["markdown", { type: "json", schema: EXTRACTION_SCHEMA, prompt: EXTRACTION_PROMPT }] }),
});
const j = await res.json();
console.log("status", res.status, "credits", j.data?.metadata?.creditsUsed, "title", j.data?.metadata?.title, "md chars", j.data?.markdown?.length);
console.log(JSON.stringify(j.data?.json ?? j, null, 1).slice(0, 6000));
if (process.argv[3]) (await import("node:fs")).writeFileSync(process.argv[3], JSON.stringify({ url, markdown: j.data?.markdown, json: j.data?.json, metadata: j.data?.metadata }, null, 1));
