import { mkdir, readFile, writeFile } from "node:fs/promises";

const inputPath = "work/source-docs/umich-offcampus-listings.html";
const outputPath = "data/inventory/umich-offcampus-listings.json";
const marker = "var listingData = JSON.parse(JSON.stringify(";

const html = await readFile(inputPath, "utf8");
const start = html.indexOf(marker);
if (start < 0) throw new Error("Could not find embedded listingData on the U-M listings page.");

const lineEnd = html.indexOf("\n", start);
if (lineEnd < 0) throw new Error("Could not find the end of embedded listingData.");

const expression = html.slice(start + marker.length, lineEnd).trim();
if (!expression.endsWith("))")) throw new Error("Embedded listingData had an unexpected ending.");
const listingData = JSON.parse(expression.slice(0, -2));

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const records = Object.values(listingData).map((listing) => ({
  id: String(listing.id),
  title: listing.title || null,
  address: listing.address || null,
  slug: listing.slug || null,
  listing_url: listing.slug ? `https://offcampushousing.umich.edu/city/ann-arbor-mi/listing/${listing.slug}` : null,
  property_type: listing.category_title || null,
  landlord_company: listing.landlord_company || null,
  landlord_website: listing.landlord_website || listing.website || null,
  latitude: numberOrNull(listing.lat),
  longitude: numberOrNull(listing.lng),
  availability_label: listing.available || null,
  earliest_available_date: listing.date || null,
  expiry_date: listing.expiry_date || null,
  rent_style: listing.rent_style || null,
  hide_pricing: Boolean(listing.hide_pricing),
  min_bedrooms: numberOrNull(listing.min_bed),
  max_bedrooms: numberOrNull(listing.max_bed),
  min_bathrooms: numberOrNull(listing.min_bath),
  max_bathrooms: numberOrNull(listing.max_bath),
  min_rent: numberOrNull(listing.min_rent),
  max_rent: numberOrNull(listing.max_rent),
  min_per_person_rent: numberOrNull(listing.min_per_person_rent),
  max_per_person_rent: numberOrNull(listing.max_per_person_rent),
  max_per_unit_rent: numberOrNull(listing.max_per_unit_rent),
  campus_walk_label: listing.distance || null,
  furnished: Boolean(listing.property_features?.furnished),
  air_conditioning: Boolean(listing.ac_allowed),
  laundry: Boolean(listing.laundry_allowed),
  parking: Boolean(listing.parking_allowed),
  pet_policy: listing.pets_allowed || null,
  utilities: Object.values(listing.utilities || {}),
  unit_features: listing.unitFeatures || [],
  property_features: listing.listingFeatures || [],
  lease_lengths: listing.features?.["Lease Length"] || [],
  intended_for: listing.features?.["Intended For"] || [],
  floorplans: (listing.floorplans || []).map((floorplan) => ({
    title: floorplan.title || null,
    bedrooms: numberOrNull(floorplan.bed),
    bathrooms: numberOrNull(floorplan.bath),
    min_rent: numberOrNull(floorplan.min_rent),
    max_rent: numberOrNull(floorplan.max_rent),
    per_person_rent: numberOrNull(floorplan.person_rent),
    unit_rent: numberOrNull(floorplan.unit_rent),
    square_feet: numberOrNull(floorplan.sq_footage),
    available_date: floorplan.available_date || null,
    status: floorplan.status || null
  })),
  campus_destination_distances: Object.fromEntries(
    Object.entries(listing.property_destination_distances || {}).map(([id, distance]) => [id, {
      walk_distance: distance.walk_distance || null,
      walk_duration: distance.walk_duration || null,
      bus_distance: distance.bus_distance || null,
      bus_duration: distance.bus_duration || null,
      cycle_distance: distance.cycle_distance || null,
      cycle_duration: distance.cycle_duration || null,
      drive_distance: distance.drive_distance || null,
      drive_duration: distance.drive_duration || null
    }])
  ),
  source: "University of Michigan Off-Campus Housing marketplace",
  source_url: "https://offcampushousing.umich.edu/listing",
  extracted_at: new Date().toISOString()
}));

const summary = {
  listing_count: records.length,
  with_published_price: records.filter((record) => record.min_rent !== null || record.floorplans.some((plan) => plan.min_rent !== null)).length,
  with_coordinates: records.filter((record) => record.latitude !== null && record.longitude !== null).length,
  houses: records.filter((record) => record.property_type === "House").length,
  apartment_buildings: records.filter((record) => record.property_type === "Apartment Building").length,
  rooms: records.filter((record) => /room/i.test(record.property_type || "")).length
};

await mkdir("data/inventory", { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  warning: "Listings and prices change frequently. Verify source timestamps and property availability before display.",
  summary,
  records
}, null, 2)}\n`);

console.log(`Extracted ${summary.listing_count} U-M listings (${summary.with_published_price} with published prices).`);
