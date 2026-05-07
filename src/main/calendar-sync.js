const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const CALENDAR_FILE_NAME = "han-burger-calendar-events.json";
const DRIVE_LIST_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function readJson(filePath, fallbackValue) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallbackValue;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function getCalendarDataPath(paths) {
  return path.join(paths.dataRoot, "sync", "calendar", "events.json");
}

function getCalendarSyncStatePath(paths) {
  return path.join(paths.dataRoot, "sync", "calendar", "sync-state.json");
}

function stableEventForHash(event) {
  return {
    id: event.id,
    title: event.title,
    date: event.date,
    time: event.time || "",
    color: event.color,
    reminderMinutes: event.reminderMinutes,
    reminderRepeat: event.reminderRepeat || (Number(event.reminderMinutes) < 0 ? "none" : "once"),
    note: event.note || "",
    done: Boolean(event.done),
    createdAt: event.createdAt || "",
    updatedAt: event.updatedAt || "",
    deletedAt: event.deletedAt || null
  };
}

function getContentHash(data) {
  const normalizedEvents = normalizeData(data).events
    .map(stableEventForHash)
    .sort((a, b) => a.id.localeCompare(b.id));
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ version: 1, events: normalizedEvents }))
    .digest("hex");
}

function readSyncState(paths) {
  return readJson(getCalendarSyncStatePath(paths), {
    lastSyncedHash: "",
    lastSyncedAt: null
  });
}

function saveSyncState(paths, data) {
  writeJson(getCalendarSyncStatePath(paths), {
    lastSyncedHash: getContentHash(data),
    lastSyncedAt: new Date().toISOString()
  });
}

function sanitizeEvent(event) {
  if (!event?.id || !event?.date || !event?.title) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    id: String(event.id),
    title: String(event.title),
    date: String(event.date),
    time: event.time ? String(event.time) : "",
    color: /^#[0-9a-f]{6}$/i.test(event.color || "") ? event.color : "#7aa7ff",
    reminderMinutes: Number.isFinite(Number(event.reminderMinutes)) ? Number(event.reminderMinutes) : 15,
    reminderRepeat: ["none", "once", "hourly", "daily"].includes(event.reminderRepeat)
      ? event.reminderRepeat
      : Number(event.reminderMinutes) < 0
        ? "none"
        : "once",
    note: event.note ? String(event.note) : "",
    done: Boolean(event.done),
    createdAt: event.createdAt || now,
    updatedAt: event.updatedAt || now,
    deletedAt: event.deletedAt || null
  };
}

function normalizeData(data) {
  const events = Array.isArray(data?.events) ? data.events : Array.isArray(data) ? data : [];
  return {
    version: 1,
    updatedAt: data?.updatedAt || new Date().toISOString(),
    events: events.map(sanitizeEvent).filter(Boolean)
  };
}

function mergeCalendarData(leftData, rightData) {
  const merged = new Map();
  for (const event of [...normalizeData(leftData).events, ...normalizeData(rightData).events]) {
    const current = merged.get(event.id);
    if (!current || String(event.updatedAt || "").localeCompare(String(current.updatedAt || "")) >= 0) {
      merged.set(event.id, event);
    }
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    events: Array.from(merged.values()).sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return `${a.time || "00:00"}-${a.createdAt || ""}`.localeCompare(`${b.time || "00:00"}-${b.createdAt || ""}`);
    })
  };
}

async function refreshAccessToken(config, auth) {
  if (!auth?.refreshToken) {
    throw new Error("Google Drive sync needs a fresh Google sign-in.");
  }

  const params = new URLSearchParams({
    client_id: config.googleOAuth?.clientId || "",
    grant_type: "refresh_token",
    refresh_token: auth.refreshToken
  });

  if (config.googleOAuth?.clientSecret) {
    params.set("client_secret", config.googleOAuth.clientSecret);
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh Google token: ${response.status}`);
  }

  const token = await response.json();
  return {
    ...auth,
    accessToken: token.access_token,
    expiresAt: Date.now() + Math.max(0, Number(token.expires_in || 0) - 60) * 1000,
    scope: token.scope || auth.scope || ""
  };
}

async function getAccessToken(config, store) {
  let auth = store.getGoogleAuth();
  if (!auth?.accessToken) {
    throw new Error("Google Drive sync is not connected.");
  }

  if (auth.expiresAt && auth.expiresAt > Date.now() + 60000) {
    return auth.accessToken;
  }

  auth = await refreshAccessToken(config, auth);
  store.saveGoogleAuth(auth);
  return auth.accessToken;
}

async function driveRequest(config, store, url, options = {}) {
  const accessToken = await getAccessToken(config, store);
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google Drive request failed: ${response.status}${body ? ` ${body}` : ""}`);
  }

  return response;
}

async function findDriveFile(config, store) {
  const url = new URL(DRIVE_LIST_URL);
  url.searchParams.set("spaces", "appDataFolder");
  url.searchParams.set("q", `name='${CALENDAR_FILE_NAME}' and 'appDataFolder' in parents and trashed=false`);
  url.searchParams.set("fields", "files(id,name,modifiedTime)");

  const response = await driveRequest(config, store, url.toString());
  const payload = await response.json();
  return Array.isArray(payload.files) ? payload.files[0] : null;
}

async function readDriveData(config, store) {
  const file = await findDriveFile(config, store);
  if (!file?.id) {
    return null;
  }

  const url = `${DRIVE_LIST_URL}/${encodeURIComponent(file.id)}?alt=media`;
  const response = await driveRequest(config, store, url);
  return normalizeData(await response.json());
}

async function writeDriveData(config, store, data) {
  const file = await findDriveFile(config, store);
  const body = JSON.stringify(normalizeData(data));

  if (file?.id) {
    await driveRequest(config, store, `${DRIVE_UPLOAD_URL}/${encodeURIComponent(file.id)}?uploadType=media`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body
    });
    return;
  }

  const boundary = `hanburger-${Date.now()}`;
  const metadata = JSON.stringify({
    name: CALENDAR_FILE_NAME,
    parents: ["appDataFolder"]
  });
  const multipartBody = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadata,
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    body,
    `--${boundary}--`,
    ""
  ].join("\r\n");

  await driveRequest(config, store, `${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body: multipartBody
  });
}

async function readCalendarData(paths, config, store) {
  const localPath = getCalendarDataPath(paths);
  const localData = normalizeData(readJson(localPath, { version: 1, events: [] }));
  const syncState = readSyncState(paths);
  const localHash = getContentHash(localData);
  let sync = {
    provider: "local",
    ok: true,
    message: "使用本機資料"
  };

  try {
    const remoteData = await readDriveData(config, store);
    if (remoteData) {
      const remoteHash = getContentHash(remoteData);

      if (remoteHash === localHash) {
        saveSyncState(paths, localData);
        return {
          data: localData,
          sync: {
            provider: "google-drive",
            ok: true,
            message: "已確認 Google Drive 無變更"
          }
        };
      }

      if (localHash === syncState.lastSyncedHash) {
        writeJson(localPath, remoteData);
        saveSyncState(paths, remoteData);
        return {
          data: remoteData,
          sync: {
            provider: "google-drive",
            ok: true,
            message: "已下載 Google Drive 變更"
          }
        };
      }

      if (remoteHash === syncState.lastSyncedHash) {
        return {
          data: localData,
          sync: {
            provider: "google-drive",
            ok: true,
            message: "本機有尚未上傳的變更"
          }
        };
      }

      const merged = mergeCalendarData(localData, remoteData);
      writeJson(localPath, merged);
      return {
        data: merged,
        sync: {
          provider: "google-drive",
          ok: true,
          message: "本機與 Google Drive 都有變更，已先合併到本機"
        }
      };
    }

    sync = {
      provider: "google-drive",
      ok: true,
      message: "Google Drive 尚未建立同步檔"
    };
  } catch (error) {
    sync = {
      provider: "google-drive",
      ok: false,
      message: error.message
    };
  }

  writeJson(localPath, localData);
  return { data: localData, sync };
}

async function saveCalendarData(paths, config, store, incomingData) {
  const localPath = getCalendarDataPath(paths);
  const localData = normalizeData(readJson(localPath, { version: 1, events: [] }));
  const merged = mergeCalendarData(localData, incomingData);
  writeJson(localPath, merged);

  return {
    data: merged,
    sync: {
      provider: "local",
      ok: true,
      message: "已儲存到本機"
    }
  };
}

async function uploadCalendarData(paths, config, store, options = {}) {
  const localPath = getCalendarDataPath(paths);
  const localData = normalizeData(readJson(localPath, { version: 1, events: [] }));
  const syncState = readSyncState(paths);
  const localHash = getContentHash(localData);

  if (options.skipUnchanged && syncState.lastSyncedHash && localHash === syncState.lastSyncedHash) {
    return {
      data: localData,
      sync: {
        provider: "local",
        ok: true,
        message: "內容沒有變更，已略過上傳"
      }
    };
  }

  try {
    const remoteData = await readDriveData(config, store);

    if (remoteData) {
      const remoteHash = getContentHash(remoteData);

      if (remoteHash === localHash) {
        saveSyncState(paths, localData);
        return {
          data: localData,
          sync: {
            provider: "google-drive",
            ok: true,
            message: "沒有變更需要上傳"
          }
        };
      }

      if (localHash === syncState.lastSyncedHash) {
        writeJson(localPath, remoteData);
        saveSyncState(paths, remoteData);
        return {
          data: remoteData,
          sync: {
            provider: "google-drive",
            ok: true,
            message: "已下載 Google Drive 變更，無需上傳"
          }
        };
      }

      if (remoteHash !== syncState.lastSyncedHash && localHash !== syncState.lastSyncedHash) {
        const merged = mergeCalendarData(localData, remoteData);
        writeJson(localPath, merged);
        await writeDriveData(config, store, merged);
        saveSyncState(paths, merged);
        return {
          data: merged,
          sync: {
            provider: "google-drive",
            ok: true,
            message: "已合併並上傳 Google Drive"
          }
        };
      }
    }

    const nextData = localData;
    await writeDriveData(config, store, nextData);
    saveSyncState(paths, nextData);
    return {
      data: nextData,
      sync: {
        provider: "google-drive",
        ok: true,
        message: "已上傳 Google Drive"
      }
    };
  } catch (error) {
    return {
      data: localData,
      sync: {
        provider: "google-drive",
        ok: false,
        message: error.message
      }
    };
  }
}

module.exports = {
  getContentHash,
  mergeCalendarData,
  normalizeData,
  readCalendarData,
  saveCalendarData,
  uploadCalendarData
};
