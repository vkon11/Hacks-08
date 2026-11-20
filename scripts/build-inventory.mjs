import { mkdir, readFile, writeFile } from "node:fs/promises";

const registryPath = "work/source-docs/ann-arbor-registered-rentals-2020.csv";
const hawcPath = "work/source-docs/hawc-normalized.txt";

function parseCsv(input) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

function clean(value) {
  return value?.replace(/^\uFEFF/, "").replace(/\s+/g, " ").trim() || null;
}

function normalizeAddress(address) {
  return clean(address)?.toUpperCase()
    .replace(/\bSTREET\b/g, "ST")
    .replace(/\bAVENUE\b/g, "AVE")
    .replace(/\bROAD\b/g, "RD")
    .replace(/\bDRIVE\b/g, "DR")
    .replace(/\bCOURT\b/g, "CT")
    .replace(/\bBOULEVARD\b/g, "BLVD")
    .replace(/\s+/g, " ");
}

function parseRegistry(input) {
  const [headers, ...rows] = parseCsv(input);
  const keys = headers.map((header) => clean(header));
  const records = rows.map((cells) => Object.fromEntries(keys.map((key, index) => [key, clean(cells[index])])))
    .filter((record) => record["Site Address"]);

  const byAddress = new Map();
  for (const record of records) {
    const address = normalizeAddress(record["Site Address"]);
    const entry = byAddress.get(address) ?? {
      address,
      source: "City of Ann Arbor rental registry export",
      source_as_of: "2020-05-19",
      statuses: [],
      property_types: [],
      permit_numbers: [],
      owners: [],
      descriptions: [],
      stipulations: []
    };
    if (record.STATUS) entry.statuses.push(record.STATUS);
    if (record["Permit Subtype"]) entry.property_types.push(record["Permit Subtype"]);
    if (record["Permit Number"]) entry.permit_numbers.push(record["Permit Number"]);
    if (record.OWNER_NAME) entry.owners.push(record.OWNER_NAME);
    if (record.DESCRIPTION) entry.descriptions.push(record.DESCRIPTION);
    if (record.STIPULATIONS) entry.stipulations.push(record.STIPULATIONS);
    byAddress.set(address, entry);
  }

  return [...byAddress.values()].map((entry) => ({
    ...entry,
    statuses: [...new Set(entry.statuses)],
    property_types: [...new Set(entry.property_types)],
    permit_numbers: [...new Set(entry.permit_numbers)],
    owners: [...new Set(entry.owners)],
    descriptions: [...new Set(entry.descriptions)],
    stipulations: [...new Set(entry.stipulations)]
  }));
}

function priceNumber(value) {
  if (!value?.includes("$")) return null;
  const matches = [...value.matchAll(/\$([\d,]+)/g)].map((match) => Number(match[1].replaceAll(",", "")));
  return matches.length ? { min: Math.min(...matches), max: Math.max(...matches) } : null;
}

function parseHawc(input) {
  const heading = /(?:\*NEW\*\s*)?([A-Z][A-Za-z0-9 .&’'()-]{2,80}?)\s*\|\s*([^|]{5,120}?)\s*\|\s*\((\d{3})\)\s*([\d-]{7,12})/g;
  const matches = [...input.matchAll(heading)];
  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? input.length;
    const body = input.slice(start, end).replace(/\s*---PAGE---\s*/g, " ");
    const layoutPattern = /\b(Studio|Efficiency|[1-5]BR):\s*([^;]{1,80}?)(?=\s+(?:Studio|Efficiency|[1-5]BR|Utilities|Security Deposit|Application Fee|Income Requirement|Covered by|Not covered|Accepts Pets|Closest Bus Stop|$))/g;
    const layouts = [...body.matchAll(layoutPattern)].map((layout) => ({
      layout: layout[1],
      published_value: clean(layout[2]),
      price_range: priceNumber(layout[2])
    }));
    const url = body.match(/https?:\/\/[^\s]+/)?.[0]?.replace(/[.,]$/, "") ?? null;
    const utilities = body.match(/Utilities:\s*(.*?)(?=\s+(?:Security Deposit|Application Fee|Admin Fee|Income Requirement|Covered by|Not covered|Accepts Pets|Closest Bus Stop))/)?.[1] ?? null;
    const city = /\bAnn Arbor\b/i.test(match[2]) ? "Ann Arbor" : /\bYpsilanti\b/i.test(match[2]) ? "Ypsilanti" : /\bSaline\b/i.test(match[2]) ? "Saline" : /\bManchester\b/i.test(match[2]) ? "Manchester" : null;
    return {
      property_name: clean(match[1]),
      address: clean(match[2]),
      city,
      phone: `(${match[3]}) ${match[4]}`,
      source_url: url,
      source_as_of: "2025-04-02",
      layouts,
      utilities: clean(utilities),
      accepts_pets: /Accepts Pets:\s*Yes/i.test(body) ? true : /Accepts Pets:\s*No/i.test(body) ? false : null,
      section_504: /Covered by Section 504/i.test(body) && !/Not covered by Section 504/i.test(body),
      closest_bus_stop_miles: Number(body.match(/Closest Bus Stop:\s*([\d.]+)\s*miles/i)?.[1] ?? NaN) || null,
      accessible_parking: /Accessible Parking:\s*Yes/i.test(body) ? true : /Accessible Parking:\s*No/i.test(body) ? false : null,
      evidence_text: clean(body)?.slice(0, 1200)
    };
  });
}

const registry = parseRegistry(await readFile(registryPath, "utf8"));
const hawc = parseHawc(await readFile(hawcPath, "utf8"));
await mkdir("data/inventory", { recursive: true });

await writeFile("data/inventory/ann-arbor-registered-rentals.json", `${JSON.stringify({
  warning: "Historical address baseline from May 2020. Verify current certification and availability before display.",
  source_url: "https://matth.org/ann-arbor-rentals/all_crs_5_19_20.csv",
  unique_addresses: registry.length,
  records: registry
}, null, 2)}\n`);

await writeFile("data/inventory/hawc-properties.json", `${JSON.stringify({
  warning: "Published April 2025. Prices and availability require refresh from linked property pages.",
  source_url: "https://www.housingaccess.net/uploads/5/2/8/4/52846659/hawchousingresourcelist_april25.pdf",
  property_count: hawc.length,
  ann_arbor_property_count: hawc.filter((record) => record.city === "Ann Arbor").length,
  records: hawc
}, null, 2)}\n`);

console.log(`Built ${registry.length} unique registered-rental addresses and ${hawc.length} HAWC properties.`);
