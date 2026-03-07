const https = require("https");
const fs = require("fs");
const path = require("path");

const GROUPS_PATH = path.resolve(__dirname, "..", "groups.json");
const COMICK_GROUP_URLS = [
  "https://comick.dev/group/popular",
  "https://comick.dev/group/popular/2026",
  "https://comick.dev/group/popular/2025",
  "https://comick.dev/group/popular/2024",
  "https://comick.dev/group/popular/2023",
  "https://comick.dev/group/popular/2022",
  "https://comick.dev/group/popular/2021",
  "https://comick.dev/group/popular/2020",
];

function fetchPage(url) {
  return new Promise((resolve) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        let html = "";
        res.on("data", (chunk) => {
          html += chunk;
        });
        res.on("end", () => {
          const match = html.match(
            /<script id="__NEXT_DATA__" type="application\/json">(\{.*?\})<\/script>/,
          );

          if (!match) {
            console.error(`No data on ${url}`);
            resolve([]);
            return;
          }

          const data = JSON.parse(match[1]);
          const groups = data.props.pageProps.groups.map((group) => ({
            title: group.title.trim(),
            slug: group.slug,
          }));

          console.log(`${url}: ${groups.length} groups`);
          resolve(groups);
        });
      })
      .on("error", (error) => {
        console.error(`Failed: ${url} ${error.message}`);
        resolve([]);
      });
  });
}

function loadExistingGroups() {
  try {
    return JSON.parse(fs.readFileSync(GROUPS_PATH, "utf8"));
  } catch {
    return [];
  }
}

async function fetchAndMergeGroups() {
  const existingMap = new Map();

  for (const group of loadExistingGroups()) {
    existingMap.set(group.slug, group);
  }

  for (const url of COMICK_GROUP_URLS) {
    const groups = await fetchPage(url);

    for (const group of groups) {
      if (existingMap.has(group.slug)) {
        existingMap.get(group.slug).title = group.title;
        continue;
      }

      existingMap.set(group.slug, {
        title: group.title,
        slug: group.slug,
        url: "",
      });
    }
  }

  const mergedGroups = Array.from(existingMap.values()).sort((left, right) =>
    left.title.localeCompare(right.title),
  );

  fs.writeFileSync(GROUPS_PATH, `${JSON.stringify(mergedGroups, null, 2)}\n`);
  console.log(`Total: ${mergedGroups.length} groups`);

  return mergedGroups;
}

if (require.main === module) {
  fetchAndMergeGroups().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  fetchAndMergeGroups,
};
