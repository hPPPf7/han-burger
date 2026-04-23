const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createStore } = require("../src/main/store");

function createTempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "han-burger-store-"));
  const dataRoot = path.join(root, "app-data");
  const configRoot = path.join(dataRoot, "config");
  const projectsRoot = path.join(dataRoot, "projects");
  const usersRoot = path.join(dataRoot, "users");

  fs.mkdirSync(configRoot, { recursive: true });
  fs.mkdirSync(projectsRoot, { recursive: true });
  fs.mkdirSync(usersRoot, { recursive: true });

  return {
    root,
    dataRoot,
    configRoot,
    projectsRoot,
    usersRoot
  };
}

test("createStore resolves managed project paths inside app-data", () => {
  const paths = createTempPaths();
  const projectsFile = path.join(paths.configRoot, "projects.json");

  fs.writeFileSync(projectsFile, JSON.stringify([
    {
      id: "watch",
      storagePath: "projects/han-burger-watch",
      entryFilePath: "projects/han-burger-watch/index.html",
      updateFeed: {
        provider: "github",
        owner: "hPPPf7",
        repo: "han-burger-watch",
        assetName: "han-burger-watch.zip"
      }
    }
  ], null, 2), "utf8");

  const store = createStore(paths);
  const [project] = store.getProjects();

  assert.equal(project.storagePath, path.join(paths.projectsRoot, "han-burger-watch"));
  assert.equal(project.entryFilePath, path.join(paths.projectsRoot, "han-burger-watch", "index.html"));
  assert.deepEqual(project.updateFeed, {
    provider: "github",
    owner: "hPPPf7",
    repo: "han-burger-watch",
    assetName: "han-burger-watch.zip"
  });

  fs.rmSync(paths.root, { recursive: true, force: true });
});

test("createStore rejects project paths that escape managed roots", () => {
  const paths = createTempPaths();
  const projectsFile = path.join(paths.configRoot, "projects.json");

  fs.writeFileSync(projectsFile, JSON.stringify([
    {
      id: "watch",
      storagePath: "../escape",
      entryFilePath: "projects/han-burger-watch/index.html",
      updateFeed: {
        provider: "github",
        owner: "hPPPf7",
        repo: "han-burger-watch",
        assetName: "han-burger-watch.zip"
      }
    }
  ], null, 2), "utf8");

  const store = createStore(paths);

  assert.throws(
    () => store.getProjects(),
    /Invalid storagePath/
  );

  fs.rmSync(paths.root, { recursive: true, force: true });
});

test("createStore rejects paths that escape through an existing junction", () => {
  const paths = createTempPaths();
  const projectsFile = path.join(paths.configRoot, "projects.json");
  const outsideRoot = path.join(paths.root, "outside");
  const linkedPath = path.join(paths.projectsRoot, "linked");

  fs.mkdirSync(outsideRoot, { recursive: true });
  fs.symlinkSync(outsideRoot, linkedPath, "junction");

  fs.writeFileSync(projectsFile, JSON.stringify([
    {
      id: "watch",
      storagePath: "projects/linked/han-burger-watch",
      entryFilePath: "projects/han-burger-watch/index.html",
      updateFeed: {
        provider: "github",
        owner: "hPPPf7",
        repo: "han-burger-watch",
        assetName: "han-burger-watch.zip"
      }
    }
  ], null, 2), "utf8");

  const store = createStore(paths);

  assert.throws(
    () => store.getProjects(),
    /Invalid storagePath/
  );

  fs.rmSync(paths.root, { recursive: true, force: true });
});
