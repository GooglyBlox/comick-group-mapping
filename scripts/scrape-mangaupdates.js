const https = require("https");
const {
  buildUnmappedIndex,
  loadGroups,
  recordMatch,
  saveGroups,
  sleep,
} = require("./scrape-utils");

const DELAY_MS = 1000;
const PER_PAGE = 100;
const REQUEST_TIMEOUT_MS = 10000;

function apiSearch(page, search) {
  return new Promise((resolve, reject) => {
    const payload = { page, perpage: PER_PAGE };
    if (search) {
      payload.search = search;
    }

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

// Search prefixes to work around the 10,000 results cap per query
const PREFIXES = [
  "", // catches symbols/numbers that don't match any letter
  ..."abcdefghijklmnopqrstuvwxyz".split(""),
];

async function fetchAllForPrefix(prefix, unmapped, groups, matches) {
  let page = 1;
  let totalProcessed = 0;
  let matched = 0;

  while (true) {
    const label = prefix
      ? `"${prefix}" page ${page}`
      : `(no prefix) page ${page}`;
    process.stdout.write(`  Fetching ${label}...`);

    let response;
    try {
      response = await apiSearch(page, prefix || undefined);
    } catch (err) {
      console.log(` ERROR: ${err.message}`);
      break;
    }

    const results = response.results || [];
    console.log(` ${results.length} results (total: ${response.total_hits})`);

    if (results.length === 0) break;

    for (const { record } of results) {
      if (!record) continue;
      totalProcessed++;

      const siteUrl = record.social?.site;
      if (
        recordMatch({
          groups,
          unmapped,
          matches,
          title: record.name,
          url: siteUrl,
        })
      ) {
        matched++;
      }
    }

    if (totalProcessed >= response.total_hits) break;

    page++;
    await sleep(DELAY_MS);
  }

  return { totalProcessed, matched };
}

async function main() {
  console.log("Loading groups.json...");
  const groups = loadGroups();
  const unmapped = buildUnmappedIndex(groups);

  console.log(`${unmapped.size} unmapped groups to look for on MangaUpdates\n`);

  let grandTotal = 0;
  let grandMatched = 0;
  const matches = [];

  for (const prefix of PREFIXES) {
    if (unmapped.size === 0) {
      console.log("All groups matched, stopping early!");
      break;
    }

    console.log(
      `\nSearching prefix: ${prefix || "(all)"} (${unmapped.size} remaining)`,
    );
    const { totalProcessed, matched } = await fetchAllForPrefix(
      prefix,
      unmapped,
      groups,
      matches,
    );
    grandTotal += totalProcessed;
    grandMatched += matched;
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Processed ${grandTotal} total MangaUpdates results`);
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
