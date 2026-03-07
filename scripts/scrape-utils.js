const fs = require("fs");
const path = require("path");

const GROUPS_PATH = path.resolve(__dirname, "..", "groups.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeName(value) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function loadGroups() {
  return JSON.parse(fs.readFileSync(GROUPS_PATH, "utf8"));
}

function saveGroups(groups) {
  fs.writeFileSync(GROUPS_PATH, `${JSON.stringify(groups, null, 2)}\n`);
}

function buildUnmappedIndex(groups) {
  const unmapped = new Map();

  groups.forEach((group, index) => {
    if (!group.url) {
      unmapped.set(normalizeName(group.title), index);
    }
  });

  return unmapped;
}

function recordMatch({ groups, unmapped, matches, title, url }) {
  const key = normalizeName(title);
  const groupIndex = unmapped.get(key);

  if (groupIndex === undefined || !url) {
    return false;
  }

  groups[groupIndex].url = url;
  matches.push({ title: groups[groupIndex].title, url });
  unmapped.delete(key);
  return true;
}

module.exports = {
  GROUPS_PATH,
  buildUnmappedIndex,
  loadGroups,
  normalizeName,
  recordMatch,
  saveGroups,
  sleep,
};
