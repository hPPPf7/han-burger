const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { ReadableStream } = require("node:stream/web");

const { createStore } = require("../src/main/store");
const { installProjectFiles, uninstallProjectFiles } = require("../src/main/project-manager");

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "han-burger-packaged-"));
}

function withMockedElectronApp(mockApp, loader) {
  const modulePath = require.resolve("../src/main/paths");
  const originalLoad = Module._load;
  delete require.cache[modulePath];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "electron") {
      return { app: mockApp };
    }

    return originalLoad.apply(this, arguments);
  };

  try {
    return loader(require("../src/main/paths"));
  } finally {
    Module._load = originalLoad;
    delete require.cache[modulePath];
  }
}

test("packaged initializeStorage seeds han-burger-watch metadata and supports GitHub release install/remove", async () => {
  const tempRoot = createTempRoot();
  const fakeExeDir = path.join(tempRoot, "dist");
  const fakeExePath = path.join(fakeExeDir, "Han Burger Desktop.exe");
  const fakeUserData = path.join(tempRoot, "user-data");

  fs.mkdirSync(fakeExeDir, { recursive: true });
  fs.mkdirSync(fakeUserData, { recursive: true });
  fs.writeFileSync(fakeExePath, "", "utf8");

  const mockApp = {
    isPackaged: true,
    getPath(name) {
      if (name === "exe") {
        return fakeExePath;
      }

      if (name === "userData") {
        return fakeUserData;
      }

      throw new Error(`Unexpected getPath(${name})`);
    }
  };

  const appPaths = withMockedElectronApp(mockApp, ({ initializeStorage }) => initializeStorage());
  const store = createStore(appPaths);
  const project = store.getProjects().find((item) => item.id === "han-burger-watch");

  assert.ok(project, "han-burger-watch should exist in seeded project config");
  assert.equal(project.installed, false);
  assert.deepEqual(project.updateFeed, {
    provider: "github",
    owner: "hPPPf7",
    repo: "han-burger-watch",
    assetName: "han-burger-watch.zip"
  });

  await installProjectFiles(project, {
    fetchImpl: async (url) => {
      if (String(url).includes("/releases/latest")) {
        return {
          ok: true,
          async json() {
            return {
              tag_name: "v0.1.0",
              assets: [
                {
                  name: "han-burger-watch.zip",
                  browser_download_url: "https://example.test/han-burger-watch.zip"
                }
              ]
            };
          }
        };
      }

      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("zip-binary"));
            controller.close();
          }
        })
      };
    },
    execFileImpl: async () => {
      fs.writeFileSync(path.join(project.storagePath, "index.html"), "<h1>installed from release</h1>\n", "utf8");
    },
    tempRoot: path.join(tempRoot, "download-temp")
  });

  const installedEntry = path.join(project.storagePath, "index.html");
  assert.equal(fs.existsSync(installedEntry), true);
  assert.match(fs.readFileSync(installedEntry, "utf8"), /installed from release/);

  uninstallProjectFiles(project);
  assert.equal(fs.existsSync(project.storagePath), false);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("packaged initializeStorage uses configured project data folder", () => {
  const tempRoot = createTempRoot();
  const fakeExeDir = path.join(tempRoot, "dist");
  const fakeExePath = path.join(fakeExeDir, "Han Burger Desktop.exe");
  const fakeUserData = path.join(tempRoot, "user-data");
  const fakeAppData = path.join(tempRoot, "app-data-root");
  const customDataRoot = path.join(tempRoot, "custom-project-data");

  fs.mkdirSync(fakeExeDir, { recursive: true });
  fs.mkdirSync(fakeUserData, { recursive: true });
  fs.mkdirSync(path.join(fakeAppData, "han-burger-desktop"), { recursive: true });
  fs.writeFileSync(fakeExePath, "", "utf8");
  fs.writeFileSync(path.join(fakeAppData, "han-burger-desktop", "data-root.txt"), customDataRoot, "utf8");

  const mockApp = {
    isPackaged: true,
    getPath(name) {
      if (name === "exe") {
        return fakeExePath;
      }

      if (name === "userData") {
        return fakeUserData;
      }

      if (name === "appData") {
        return fakeAppData;
      }

      throw new Error(`Unexpected getPath(${name})`);
    }
  };

  const appPaths = withMockedElectronApp(mockApp, ({ initializeStorage }) => initializeStorage());

  assert.equal(appPaths.dataRoot, customDataRoot);
  assert.equal(fs.existsSync(path.join(customDataRoot, "config")), true);
  assert.equal(fs.existsSync(path.join(customDataRoot, "projects")), true);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("packaged initializeStorage restores missing built-in project metadata", () => {
  const tempRoot = createTempRoot();
  const fakeExeDir = path.join(tempRoot, "dist");
  const fakeExePath = path.join(fakeExeDir, "Han Burger Desktop.exe");
  const fakeUserData = path.join(tempRoot, "user-data");
  const fakeDataRoot = path.join(tempRoot, "data-root");
  const fakeConfigRoot = path.join(fakeDataRoot, "config");

  fs.mkdirSync(fakeExeDir, { recursive: true });
  fs.mkdirSync(fakeUserData, { recursive: true });
  fs.mkdirSync(fakeConfigRoot, { recursive: true });
  fs.writeFileSync(fakeExePath, "", "utf8");
  fs.writeFileSync(path.join(fakeUserData, "data-root.txt"), fakeDataRoot, "utf8");
  fs.writeFileSync(path.join(fakeConfigRoot, "projects.json"), JSON.stringify([
    {
      id: "custom-project",
      name: "Custom Project",
      storagePath: "projects/custom-project",
      installed: false
    }
  ]), "utf8");

  const mockApp = {
    isPackaged: true,
    getPath(name) {
      if (name === "exe") {
        return fakeExePath;
      }

      if (name === "userData") {
        return fakeUserData;
      }

      throw new Error(`Unexpected getPath(${name})`);
    }
  };

  withMockedElectronApp(mockApp, ({ initializeStorage }) => initializeStorage());

  const projects = JSON.parse(fs.readFileSync(path.join(fakeConfigRoot, "projects.json"), "utf8"));
  assert.ok(projects.some((project) => project.id === "custom-project"));
  assert.ok(projects.some((project) => project.id === "han-burger-watch"));
  assert.ok(projects.some((project) => project.id === "han-burger-calendar"));

  fs.rmSync(tempRoot, { recursive: true, force: true });
});
