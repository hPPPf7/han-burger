const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("core-dashboard is not marked installed without an entry file", () => {
  const projectsPath = path.join(__dirname, "..", "build", "app-data", "config", "projects.json");
  const projects = JSON.parse(fs.readFileSync(projectsPath, "utf8"));
  const coreDashboard = projects.find((project) => project.id === "core-dashboard");

  assert.ok(coreDashboard);
  assert.equal(coreDashboard.installed, false);
});
