const https = require("https");
const {
  buildUnmappedIndex,
  loadGroups,
  recordMatch,
  saveGroups,
  sleep,
} = require("./scrape-utils");

const DELAY_MS = 300;
const LIMIT = 100;
const MAX_OFFSET = 10000; // MangaDex Elasticsearch cap
const REQUEST_TIMEOUT_MS = 10000;

function fetchGroups(offset, name) {
  return new Promise((resolve, reject) => {
    let url = `https://api.mangadex.org/group?limit=${LIMIT}&offset=${offset}&order[name]=asc`;
    if (name) {
      url += `&name=${encodeURIComponent(name)}`;
    }

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

// Search by each letter prefix to work around the 10k offset cap
const PREFIXES = "abcdefghijklmnopqrstuvwxyz".split("");

async function fetchAllForPrefix(prefix, unmapped, groups, matches) {
  let offset = 0;
  let total = Infinity;
  let processed = 0;
  let matched = 0;

  while (offset < total && offset < MAX_OFFSET) {
    process.stdout.write(`  [${prefix}] offset ${offset}...`);

    let response;
    try {
      response = await fetchGroups(offset, prefix);
    } catch (err) {
      console.log(` ERROR: ${err.message}`);
      break;
    }

    if (response.result !== "ok") {
      if (response.errors?.[0]?.status === 429) {
        console.log(" Rate limited, waiting 5s...");
        await sleep(5000);
        continue;
      }
      console.log(` API error: ${response.errors?.[0]?.detail || "unknown"}`);
      break;
    }

    total = response.total;
    const results = response.data || [];
    console.log(
      ` ${results.length} groups (${Math.min(offset + results.length, total)}/${total})`,
    );

    if (results.length === 0) break;

    for (const group of results) {
      const name = group.attributes?.name;
      const website = group.attributes?.website;
      if (!name) continue;
      processed++;

      if (recordMatch({ groups, unmapped, matches, title: name, url: website })) {
        matched++;
      }
    }

    offset += results.length;
    await sleep(DELAY_MS);
  }

  return { processed, matched };
}

async function main() {
  console.log("Loading groups.json...");
  const groups = loadGroups();
  const unmapped = buildUnmappedIndex(groups);

  console.log(`${unmapped.size} unmapped groups to match against MangaDex\n`);

  let grandTotal = 0;
  let grandMatched = 0;
  const matches = [];

  for (const prefix of PREFIXES) {
    if (unmapped.size === 0) {
      console.log("All groups matched!");
      break;
    }

    console.log(`\nSearching "${prefix}" (${unmapped.size} remaining)`);
    const { processed, matched } = await fetchAllForPrefix(
      prefix,
      unmapped,
      groups,
      matches,
    );
    grandTotal += processed;
    grandMatched += matched;
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Processed ${grandTotal} MangaDex groups`);
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
