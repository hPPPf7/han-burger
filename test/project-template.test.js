const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("packaged project list contains downloadable apps only", () => {
  const projectsPath = path.join(__dirname, "..", "build", "app-data", "config", "projects.json");
  const projects = JSON.parse(fs.readFileSync(projectsPath, "utf8"));
  const ids = projects.map((project) => project.id);

  assert.deepEqual(ids, ["han-burger-watch", "han-burger-calendar"]);
  assert.equal(projects.every((project) => project.updateFeed?.provider === "github"), true);
  assert.equal(projects.every((project) => project.updateFeed?.assetName), true);
});
