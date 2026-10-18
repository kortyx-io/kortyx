const { copyFileSync, mkdirSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

function latestReports(names) {
  const selected = new Map();
  for (const name of names) {
    const match =
      /^studio-playwright-blob-(standard|reviews|production)-(\d+)-(\d+)$/.exec(
        name,
      );
    if (!match) throw new Error(`Unexpected blob artifact: ${name}`);
    const lane = `${match[1]}-${match[2]}`;
    const attempt = Number(match[3]);
    if (!selected.has(lane) || selected.get(lane).attempt < attempt) {
      selected.set(lane, { name, attempt });
    }
  }
  if (!selected.size)
    throw new Error("No Playwright blob reports were downloaded");
  return [...selected.values()].map(({ name }) => name).sort();
}

function prepareReports(source, destination) {
  const artifacts = latestReports(readdirSync(source));
  const files = artifacts.flatMap((artifact) => {
    const reports = readdirSync(join(source, artifact), {
      withFileTypes: true,
    }).filter((entry) => entry.isFile() && entry.name.endsWith(".zip"));
    if (!reports.length) throw new Error(`No blob ZIP in ${artifact}`);
    return reports.map((entry) => ({ artifact, name: entry.name }));
  });
  // Never overwrite a previous merge input or mutate original artifacts.
  mkdirSync(destination);
  for (const { artifact, name } of files) {
    copyFileSync(
      join(source, artifact, name),
      join(destination, `${artifact}-${name}`),
    );
  }
  console.log(
    `Merging ${files.length} blob reports from ${artifacts.length} latest shard attempts`,
  );
  return artifacts;
}

module.exports = { latestReports, prepareReports };
if (require.main === module) prepareReports(process.argv[2], process.argv[3]);
