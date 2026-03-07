const https = require("https");
const {
  buildUnmappedIndex,
  listUnmappedGroups,
  loadGroups,
  normalizeName,
  recordMatch,
  saveGroups,
  sleep,
} = require("./scrape-utils");

const DELAY_MS = 300;
const LIMIT = 100;
const REQUEST_TIMEOUT_MS = 10000;

function fetchGroupsByName(name) {
  return new Promise((resolve, reject) => {
    const url =
      `https://api.mangadex.org/group?limit=${LIMIT}&order[name]=asc` +
      `&name=${encodeURIComponent(name)}`;

    const request = https.get(
      url,
      { headers: { "User-Agent": "comick-group-mapping-scraper/1.0" } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if ((res.statusCode ?? 500) >= 400) {
            reject(
              new Error(
                `HTTP ${res.statusCode}: ${data.substring(0, 200) || "empty response"}`,
              ),
            );
            return;
          }

          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Failed to parse: ${data.substring(0, 200)}`));
          }
        });
      },
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error("Request timed out"));
    });
    request.on("error", reject);
  });
}

async function enrichGroup(title, unmapped, groups, matches) {
  const normalizedTitle = normalizeName(title);

  while (true) {
    process.stdout.write(`  Searching MangaDex for "${title}"...`);

    let response;
    try {
      response = await fetchGroupsByName(title);
    } catch (error) {
      console.log(` ERROR: ${error.message}`);
      return { processed: 0, matched: 0 };
    }

    if (response.result !== "ok") {
      if (response.errors?.[0]?.status === 429) {
        console.log(" Rate limited, waiting 5s...");
        await sleep(5000);
        continue;
      }

      console.log(` API error: ${response.errors?.[0]?.detail || "unknown"}`);
      return { processed: 0, matched: 0 };
    }

    const results = response.data || [];
    console.log(` ${results.length} candidates`);

    let processed = 0;
    for (const group of results) {
      const name = group.attributes?.name;
      if (!name || normalizeName(name) !== normalizedTitle) {
        continue;
      }

      processed++;
      if (
        recordMatch({
          groups,
          unmapped,
          matches,
          title: name,
          url: group.attributes?.website,
        })
      ) {
        return { processed, matched: 1 };
      }
    }

    return { processed, matched: 0 };
  }
}

async function main() {
  console.log("Loading groups.json...");
  const groups = loadGroups();
  const unmapped = buildUnmappedIndex(groups);
  const missingTitles = listUnmappedGroups(groups);

  console.log(`${unmapped.size} unmapped groups to match against MangaDex\n`);

  let grandTotal = 0;
  let grandMatched = 0;
  const matches = [];

  for (const title of missingTitles) {
    if (unmapped.size === 0) {
      console.log("All groups matched!");
      break;
    }

    if (!unmapped.has(normalizeName(title))) {
      continue;
    }

    const { processed, matched } = await enrichGroup(title, unmapped, groups, matches);
    grandTotal += processed;
    grandMatched += matched;
    await sleep(DELAY_MS);
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Processed ${grandTotal} exact-name MangaDex candidates`);
  console.log(`Matched ${grandMatched} groups:\n`);
  for (const m of matches) {
    console.log(`  ${m.title} -> ${m.url}`);
  }

  if (grandMatched > 0) {
    saveGroups(groups);
    console.log(`\nUpdated groups.json with ${grandMatched} new URLs`);
  } else {
    console.log("\nNo new matches found, groups.json unchanged");
  }

  return {
    processed: grandTotal,
    matched: grandMatched,
    remaining: unmapped.size,
  };
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  enrichFromMangaDex: main,
};
