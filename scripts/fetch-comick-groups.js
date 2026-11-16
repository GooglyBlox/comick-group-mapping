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

function extractGroupsArray(html) {
  const payload = [
    ...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g),
  ]
    .map((match) => JSON.parse(match[1]))
    .join("");

  const key = '"groups":';
  const start = payload.indexOf(`${key}[`);
  if (start === -1) {
    return null;
  }

  const from = start + key.length;
  let depth = 0;
  let inString = false;

  for (let i = from; i < payload.length; i++) {
    const char = payload[i];

    if (inString) {
      if (char === "\\") {
        i++;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === "[") {
      depth++;
    } else if (char === "]" && --depth === 0) {
      return JSON.parse(payload.slice(from, i + 1));
    }
  }

  return null;
}

function fetchPage(url) {
  return new Promise((resolve) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        let html = "";
        res.on("data", (chunk) => {
          html += chunk;
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            console.error(`Failed: ${url} HTTP ${res.statusCode}`);
            resolve([]);
            return;
          }

          let rawGroups;
          try {
            rawGroups = extractGroupsArray(html);
          } catch (error) {
            console.error(`Failed to parse ${url}: ${error.message}`);
          }

          if (!Array.isArray(rawGroups)) {
            console.error(`No data on ${url}`);
            resolve([]);
            return;
          }

          const groups = rawGroups
            .filter((group) => group && group.slug && group.title)
            .map((group) => ({
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

  let fetchedCount = 0;

  for (const url of COMICK_GROUP_URLS) {
    const groups = await fetchPage(url);
    fetchedCount += groups.length;

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

  if (fetchedCount === 0) {
    throw new Error(
      "No groups fetched from Comick; the page structure may have changed",
    );
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
