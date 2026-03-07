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

const DELAY_MS = 1000;
const PER_PAGE = 100;
const REQUEST_TIMEOUT_MS = 10000;

function apiSearch(search) {
  return new Promise((resolve, reject) => {
    const payload = { page: 1, perpage: PER_PAGE, search };

    const body = JSON.stringify(payload);
    const requestOptions = {
      hostname: "api.mangaupdates.com",
      path: "/v1/groups/search",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const request = https.request(requestOptions, (res) => {
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
          reject(
            new Error(`Failed to parse response: ${data.substring(0, 200)}`),
          );
        }
      });
    });
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error("Request timed out"));
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

async function enrichGroup(title, unmapped, groups, matches) {
  const normalizedTitle = normalizeName(title);
  while (true) {
    process.stdout.write(`  Searching MangaUpdates for "${title}"...`);

    let response;
    try {
      response = await apiSearch(title);
    } catch (error) {
      console.log(` ERROR: ${error.message}`);
      return { processed: 0, matched: 0 };
    }

    const results = response.results || [];
    console.log(` ${results.length} candidates`);

    let processed = 0;
    for (const { record } of results) {
      if (!record?.name || normalizeName(record.name) !== normalizedTitle) {
        continue;
      }

      processed++;
      if (
        recordMatch({
          groups,
          unmapped,
          matches,
          title: record.name,
          url: record.social?.site,
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

  console.log(`${unmapped.size} unmapped groups to look for on MangaUpdates\n`);

  let grandTotal = 0;
  let grandMatched = 0;
  const matches = [];

  for (const title of missingTitles) {
    if (unmapped.size === 0) {
      console.log("All groups matched, stopping early!");
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
  console.log(`Processed ${grandTotal} exact-name MangaUpdates candidates`);
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
  enrichFromMangaUpdates: main,
};
