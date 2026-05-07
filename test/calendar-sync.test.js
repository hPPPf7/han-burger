const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  getContentHash,
  readCalendarData
} = require("../src/main/calendar-sync");

function makeEvent(id, title) {
  return {
    id,
    title,
    date: "2026-05-07",
    time: "",
    color: "#7aa7ff",
    reminderMinutes: 15,
    note: "",
    done: false,
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    deletedAt: null
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("getContentHash is stable when event order changes", () => {
  const first = {
    version: 1,
    events: [makeEvent("b", "B"), makeEvent("a", "A")]
  };
  const second = {
    version: 1,
    events: [makeEvent("a", "A"), makeEvent("b", "B")]
  };

  assert.equal(getContentHash(first), getContentHash(second));
});

test("readCalendarData downloads remote data when local matches last sync", async (t) => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "han-calendar-sync-"));
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));

  const paths = { dataRoot };
  const localData = {
    version: 1,
    events: [makeEvent("local", "本機")]
  };
  const remoteData = {
    version: 1,
    events: [makeEvent("remote", "雲端")]
  };

  writeJson(path.join(dataRoot, "sync", "calendar", "events.json"), localData);
  writeJson(path.join(dataRoot, "sync", "calendar", "sync-state.json"), {
    lastSyncedHash: getContentHash(localData),
    lastSyncedAt: "2026-05-07T00:00:00.000Z"
  });

  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async (url) => {
    if (String(url).includes("alt=media")) {
      return {
        ok: true,
        json: async () => remoteData
      };
    }

    return {
      ok: true,
      json: async () => ({
        files: [{ id: "calendar-file", name: "han-burger-calendar-events.json" }]
      })
    };
  };

  const result = await readCalendarData(
    paths,
    {},
    {
      getGoogleAuth: () => ({
        accessToken: "token",
        expiresAt: Date.now() + 600000
      })
    }
  );

  assert.equal(result.sync.message, "已下載 Google Drive 變更");
  assert.deepEqual(result.data.events.map((event) => event.id), ["remote"]);

  const localAfterSync = JSON.parse(
    fs.readFileSync(path.join(dataRoot, "sync", "calendar", "events.json"), "utf8")
  );
  assert.deepEqual(localAfterSync.events.map((event) => event.id), ["remote"]);
});
