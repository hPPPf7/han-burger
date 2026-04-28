const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ReadableStream } = require("node:stream/web");

const {
  compareVersions,
  ensureProjectDirectories,
  installProjectFiles,
  isReleaseNewerThanInstalled,
  uninstallProjectFiles,
  updateInstalledProjectFiles
} = require("../src/main/project-manager");

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "han-burger-project-manager-"));
}

test("installProjectFiles replaces stale project files before copying", async () => {
  const tempRoot = createTempDir();
  const sourcePath = path.join(tempRoot, "source");
  const storagePath = path.join(tempRoot, "projects", "watch");

  fs.mkdirSync(sourcePath, { recursive: true });
  fs.writeFileSync(path.join(sourcePath, "index.html"), "<h1>fresh</h1>\n", "utf8");
  fs.mkdirSync(storagePath, { recursive: true });
  fs.writeFileSync(path.join(storagePath, "stale.txt"), "stale\n", "utf8");

  const result = await installProjectFiles({
    id: "watch",
    storagePath,
    installSourcePath: sourcePath
  });

  assert.equal(result.installedVersion, "0.1.0");
  assert.equal(fs.existsSync(path.join(storagePath, "stale.txt")), false);
  assert.equal(fs.readFileSync(path.join(storagePath, "index.html"), "utf8"), "<h1>fresh</h1>\n");

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("installProjectFiles downloads and extracts GitHub release assets", async () => {
  const tempRoot = createTempDir();
  const storagePath = path.join(tempRoot, "projects", "watch");
  const fetchCalls = [];

  const fetchImpl = async (url) => {
    fetchCalls.push(String(url));

    if (String(url).includes("/releases/latest")) {
      return {
        ok: true,
        async json() {
          return {
            tag_name: "v1.2.3",
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
  };

  const execFileImpl = async () => {
    fs.writeFileSync(path.join(storagePath, "index.html"), "<h1>release</h1>\n", "utf8");
  };

  const result = await installProjectFiles({
    id: "han-burger-watch",
    storagePath,
    entryFilePath: path.join(storagePath, "index.html"),
    updateFeed: {
      provider: "github",
      owner: "hPPPf7",
      repo: "han-burger-watch",
      assetName: "han-burger-watch.zip"
    }
  }, {
    fetchImpl,
    execFileImpl,
    tempRoot: path.join(tempRoot, "temp")
  });

  assert.equal(result.installedVersion, "v1.2.3");
  assert.deepEqual(fetchCalls, [
    "https://api.github.com/repos/hPPPf7/han-burger-watch/releases/latest",
    "https://example.test/han-burger-watch.zip"
  ]);
  assert.equal(fs.readFileSync(path.join(storagePath, "index.html"), "utf8"), "<h1>release</h1>\n");

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("installProjectFiles rejects release payloads missing the configured entry file", async () => {
  const tempRoot = createTempDir();
  const storagePath = path.join(tempRoot, "projects", "watch");

  await assert.rejects(
    () => installProjectFiles({
      id: "han-burger-watch",
      storagePath,
      entryFilePath: path.join(storagePath, "index.html"),
      updateFeed: {
        provider: "github",
        owner: "hPPPf7",
        repo: "han-burger-watch",
        assetName: "han-burger-watch.zip"
      }
    }, {
      fetchImpl: async (url) => {
        if (String(url).includes("/releases/latest")) {
          return {
            ok: true,
            async json() {
              return {
                tag_name: "v1.2.3",
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
      execFileImpl: async () => {},
      tempRoot: path.join(tempRoot, "temp")
    }),
    /missing entry file/
  );

  assert.equal(fs.existsSync(storagePath), false);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("version comparison handles v-prefixed release tags", () => {
  assert.equal(compareVersions("v1.2.3", "1.2.2"), 1);
  assert.equal(compareVersions("v1.2.3", "1.2.3"), 0);
  assert.equal(compareVersions("v1.2.3", "1.3.0"), -1);
  assert.equal(isReleaseNewerThanInstalled("v1.2.3", "v1.2.2"), true);
  assert.equal(isReleaseNewerThanInstalled("v1.2.3", "v1.2.3"), false);
});

test("updateInstalledProjectFiles skips download when installed release is current", async () => {
  const tempRoot = createTempDir();
  const storagePath = path.join(tempRoot, "projects", "watch");
  const fetchCalls = [];

  const result = await updateInstalledProjectFiles({
    id: "han-burger-watch",
    installed: true,
    installedVersion: "v1.2.3",
    storagePath,
    entryFilePath: path.join(storagePath, "index.html"),
    updateFeed: {
      provider: "github",
      owner: "hPPPf7",
      repo: "han-burger-watch",
      assetName: "han-burger-watch.zip"
    }
  }, {
    fetchImpl: async (url) => {
      fetchCalls.push(String(url));
      return {
        ok: true,
        async json() {
          return {
            tag_name: "v1.2.3",
            assets: [
              {
                name: "han-burger-watch.zip",
                browser_download_url: "https://example.test/han-burger-watch.zip"
              }
            ]
          };
        }
      };
    },
    execFileImpl: async () => {
      throw new Error("extract should not run");
    },
    tempRoot: path.join(tempRoot, "temp")
  });

  assert.equal(result.updated, false);
  assert.deepEqual(fetchCalls, [
    "https://api.github.com/repos/hPPPf7/han-burger-watch/releases/latest"
  ]);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("updateInstalledProjectFiles downloads newer GitHub release", async () => {
  const tempRoot = createTempDir();
  const storagePath = path.join(tempRoot, "projects", "watch");
  const fetchCalls = [];

  fs.mkdirSync(storagePath, { recursive: true });
  fs.writeFileSync(path.join(storagePath, "index.html"), "<h1>old</h1>\n", "utf8");

  const result = await updateInstalledProjectFiles({
    id: "han-burger-watch",
    installed: true,
    installedVersion: "v1.2.2",
    storagePath,
    entryFilePath: path.join(storagePath, "index.html"),
    updateFeed: {
      provider: "github",
      owner: "hPPPf7",
      repo: "han-burger-watch",
      assetName: "han-burger-watch.zip"
    }
  }, {
    fetchImpl: async (url) => {
      fetchCalls.push(String(url));

      if (String(url).includes("/releases/latest")) {
        return {
          ok: true,
          async json() {
            return {
              tag_name: "v1.2.3",
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
      fs.writeFileSync(path.join(storagePath, "index.html"), "<h1>new</h1>\n", "utf8");
    },
    tempRoot: path.join(tempRoot, "temp")
  });

  assert.equal(result.updated, true);
  assert.equal(result.installedVersion, "v1.2.3");
  assert.deepEqual(fetchCalls, [
    "https://api.github.com/repos/hPPPf7/han-burger-watch/releases/latest",
    "https://example.test/han-burger-watch.zip"
  ]);
  assert.equal(fs.readFileSync(path.join(storagePath, "index.html"), "utf8"), "<h1>new</h1>\n");

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("uninstallProjectFiles removes installed project files", () => {
  const tempRoot = createTempDir();
  const storagePath = path.join(tempRoot, "projects", "watch");

  fs.mkdirSync(storagePath, { recursive: true });
  fs.writeFileSync(path.join(storagePath, "index.html"), "<h1>installed</h1>\n", "utf8");

  uninstallProjectFiles({
    id: "watch",
    storagePath
  });

  assert.equal(fs.existsSync(storagePath), false);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("ensureProjectDirectories only creates folders for installed projects", () => {
  const tempRoot = createTempDir();
  const installedPath = path.join(tempRoot, "projects", "installed");
  const uninstalledPath = path.join(tempRoot, "projects", "uninstalled");

  ensureProjectDirectories([
    {
      id: "installed",
      installed: true,
      storagePath: installedPath
    },
    {
      id: "uninstalled",
      installed: false,
      storagePath: uninstalledPath
    }
  ]);

  assert.equal(fs.existsSync(installedPath), true);
  assert.equal(fs.existsSync(uninstalledPath), false);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});
