import { writeFile } from "node:fs/promises";
async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw Error(url + ": " + r.status);
  return r;
}
const countries = await (
  await get(
    "https://raw.githubusercontent.com/mledoze/countries/master/countries.json",
  )
).json();
await writeFile(
  "public/country-locations.json",
  JSON.stringify(
    Object.fromEntries([
      ...countries
        .filter((c) => c.latlng?.length === 2)
        .map((c) => [c.cca2, c.latlng]),
      ["UK", countries.find((c) => c.cca2 === "GB").latlng],
    ]),
  ),
);
await writeFile(
  "public/country-locations-LICENSE.txt",
  await (
    await get(
      "https://raw.githubusercontent.com/mledoze/countries/master/LICENSE",
    )
  ).text(),
);
const world = await (
  await get(
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
  )
).json();
const rings = [];
for (const f of world.features) {
  const polygons =
    f.geometry.type === "Polygon"
      ? [f.geometry.coordinates]
      : f.geometry.coordinates;
  for (const p of polygons)
    for (const ring of p)
      rings.push(
        '<path d="' +
          ring
            .map(
              ([x, y], i) =>
                (i ? "L" : "M") +
                (((x + 180) / 360) * 1000).toFixed(2) +
                "," +
                (((90 - y) / 180) * 500).toFixed(2),
            )
            .join(" ") +
          'Z"/>',
      );
}
await writeFile(
  "public/world.svg",
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500"><g fill="#243e43" stroke="#48716b" stroke-width=".4">' +
    rings.join("") +
    "</g></svg>",
);
await writeFile(
  "public/earth.jpg",
  Buffer.from(
    await (
      await get(
        "https://raw.githubusercontent.com/vasturiano/three-globe/master/example/img/earth-blue-marble.jpg",
      )
    ).arrayBuffer(),
  ),
);
console.log(
  "Saved real country positions, Natural Earth map and earth texture",
);
