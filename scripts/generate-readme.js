const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const GROUPS_PATH = path.join(ROOT, "groups.json");
const README_PATH = path.join(ROOT, "README.md");

const groups = JSON.parse(fs.readFileSync(GROUPS_PATH, "utf8"));

const mapped = groups.filter((g) => g.url);
const unmapped = groups.filter((g) => !g.url);

const escMd = (s) => s.replace(/\|/g, "\\|");

function buildTable(rows) {
  const lines = [
    "| Group | Comick Page | Website |",
    "| :---- | :---------- | :------ |",
  ];
  for (const g of rows) {
    const comickLink = `[${escMd(g.title)}](https://comick.dev/group/${g.slug})`;
    const website = g.url ? `[${escMd(g.url)}](${g.url})` : "—";
    lines.push(`| ${escMd(g.title)} | ${comickLink} | ${website} |`);
  }
  return lines.join("\n");
}

const readme = `# Comick Group Mapping

A community-maintained mapping of scanlation groups on [comick.dev](https://comick.dev) to their actual websites.

> **This file is auto-generated.** Do not edit manually, it is rebuilt whenever \`groups.json\` is updated.

## Stats

- **Total Groups**: ${groups.length}
- **Mapped**: ${mapped.length}
- **Unmapped**: ${unmapped.length}

## How to Contribute

1. Open \`groups.json\`
2. Find the group you want to map
3. Add the group's website URL to the \`"url"\` field
4. Submit a pull request

## Userscript

Install the companion userscript to see mapped links directly on comick.dev group pages: [Comick Group Mapping on Greasy Fork](https://greasyfork.org/en/scripts/567563-comick-group-mapping)

## Mapped Groups

${mapped.length > 0 ? buildTable(mapped) : "_No groups mapped yet._"}

## Unmapped Groups

${unmapped.length > 0 ? buildTable(unmapped) : "_All groups are mapped!_"}
`;

fs.writeFileSync(README_PATH, readme);
console.log(
  `README.md generated — ${mapped.length} mapped, ${unmapped.length} unmapped`,
);
