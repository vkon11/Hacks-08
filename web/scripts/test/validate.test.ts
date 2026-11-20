// Validator tests on the real Foundry Lofts extraction plus the fabricated items seen on the first probe.
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { checkEvidence, choosePages } from "../../src/lib/housing/validate.ts";

const fx = JSON.parse(readFileSync("scripts/test/fixtures/foundry-amenities.json", "utf8"));
const results = fx.json.evidence.map((e: never) => checkEvidence(e, fx.markdown, 0.8));
for (const r of results) console.log(`  ${r.status.padEnd(12)} ${r.factor_key.padEnd(20)} ${r.reason ?? ""}  | ${r.quote.slice(0, 55)}`);
const by = (k: string) => results.find((r: { factor_key: string }) => r.factor_key === k);
assert.equal(by("pool").status, "rejected", "sun-soaking sentence is not a pool");
assert.equal(by("maintenance_24h").status, "rejected", "on-site maintenance is not 24h");
assert.equal(by("fitness_studio").status, "rejected", "24/7 fitness center is not a yoga studio");
assert.equal(by("private_bedroom").status, "needs_review", "'options' cannot confirm");
assert.equal(by("furnished").status, "unverified");
assert.equal(by("roommate_matching").status, "unverified");

// Fabricated items from the first probe of the same page.
for (const quote of ["Laundry facilities not listed.", "Internet services not listed.", "Pets not allowed."])
  assert.equal(checkEvidence({ factor_key: "pets_allowed", value: "false", scope: "building", quote }, fx.markdown, 0.8).reason, "quote_not_on_page");
console.log("✓ fabricated quotes rejected; misreads rejected; 'options' sent to review");

const links = ["https://x.com/blog/post", "https://x.com/floorplans", "https://x.com/floorplans/b1", "https://x.com/floorplans/b2",
  "https://x.com/amenities", "https://x.com/wp-content/uploads/2025/07/Charge_List_2025.pdf", "https://x.com/wp-content/uploads/2026/06/Charge_List_2026.pdf",
  "https://x.com/page-sitemap.xml", "https://x.com/frequently-asked-questions", "https://x.com/floorplans/availability"];
const pages = choosePages(links, "https://x.com", 6);
console.log("  chosen:", pages.map((p) => `${p.type}:${p.url.split("/").pop()}`).join(", "));
assert.ok(pages.some((p) => p.url.includes("2026")) && !pages.some((p) => p.url.includes("2025")), "newest fee PDF only");
assert.ok(!pages.some((p) => p.url.includes("blog") || p.url.includes("sitemap")));
assert.equal(pages.length, 6);
console.log("✓ page selection: newest PDF, no blog/sitemap, capped");
