const { enrichFromMangaDex } = require("./scrape-mangadex");
const { enrichFromMangaUpdates } = require("./scrape-mangaupdates");

async function enrichGroupUrls() {
  console.log("Running MangaDex enrichment...");
  const mangadexResult = await enrichFromMangaDex();

  console.log("\nRunning MangaUpdates enrichment...");
  const mangaupdatesResult = await enrichFromMangaUpdates();

  const totalMatched =
    mangadexResult.matched + mangaupdatesResult.matched;

  console.log(`\nEnrichment complete. Added ${totalMatched} URLs in total.`);

  return {
    mangadex: mangadexResult,
    mangaupdates: mangaupdatesResult,
    matched: totalMatched,
  };
}

if (require.main === module) {
  enrichGroupUrls().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  enrichGroupUrls,
};
