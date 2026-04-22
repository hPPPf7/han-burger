const fs = require("node:fs");
const path = require("node:path");
const { app, Notification } = require("electron");
const log = require("electron-log");
const { autoUpdater } = require("electron-updater");

const AUTO_RESTART_DELAY_MS = 3000;

function getUpdateMarkerPath() {
  return path.join(app.getPath("userData"), "pending-update.json");
}

function showDesktopNotification(title, body) {
  if (!Notification.isSupported()) {
    return;
  }

  new Notification({
    title,
    body
  }).show();
}

function readAppliedUpdateStatus() {
  const markerPath = getUpdateMarkerPath();
  if (!fs.existsSync(markerPath)) {
    return null;
  }

  try {
    const payload = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    fs.rmSync(markerPath, { force: true });

    if (payload?.toVersion && payload.toVersion === app.getVersion()) {
      return {
        stage: "installed",
        currentVersion: app.getVersion(),
        latestVersion: app.getVersion(),
        downloaded: false,
        message: `已完成更新，目前版本 ${app.getVersion()}`
      };
    }
  } catch {
    fs.rmSync(markerPath, { force: true });
  }

  return null;
}

function writePendingUpdateMarker(targetVersion) {
  const markerPath = getUpdateMarkerPath();
  fs.writeFileSync(
    markerPath,
    `${JSON.stringify({
      fromVersion: app.getVersion(),
      toVersion: targetVersion,
      updatedAt: new Date().toISOString()
    }, null, 2)}\n`,
    "utf8"
  );
}

function configureUpdater(mainWindow) {
  if (!app.isPackaged) {
    return {
      enabled: false,
      hasDownloadedUpdate: false,
      getStartupStatus: () => null,
      checkForUpdates: async () => ({
        enabled: false,
        message: "Updater is disabled in development mode."
      }),
      restartToApplyUpdate: () => false
    };
  }

  let hasDownloadedUpdate = false;
  let downloadedVersion = null;
  let autoRestartTimer = null;
  const startupStatus = readAppliedUpdateStatus();

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    mainWindow.webContents.send("update-status", {
      stage: "checking",
      currentVersion: app.getVersion(),
      latestVersion: null,
      downloaded: false,
      message: "正在檢查更新"
    });
  });

  autoUpdater.on("update-available", (info) => {
    mainWindow.webContents.send("update-status", {
      stage: "available",
      currentVersion: app.getVersion(),
      latestVersion: info.version,
      downloaded: false,
      message: `發現新版本 ${info.version}，正在自動下載`
    });
  });

  autoUpdater.on("update-not-available", () => {
    mainWindow.webContents.send("update-status", {
      stage: "idle",
      currentVersion: app.getVersion(),
      latestVersion: app.getVersion(),
      downloaded: false,
      message: `目前已是最新版本 ${app.getVersion()}`
    });
  });

  autoUpdater.on("error", (error) => {
    mainWindow.webContents.send("update-status", {
      stage: "error",
      currentVersion: app.getVersion(),
      latestVersion: null,
      downloaded: false,
      message: `更新檢查失敗: ${error.message}`
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    mainWindow.webContents.send("update-status", {
      stage: "downloading",
      currentVersion: app.getVersion(),
      latestVersion: null,
      downloaded: false,
      message: `更新下載中 ${Math.round(progress.percent)}%`
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    hasDownloadedUpdate = true;
    downloadedVersion = info.version;
    mainWindow.webContents.send("update-status", {
      stage: "downloaded",
      currentVersion: app.getVersion(),
      latestVersion: info.version,
      downloaded: true,
      message: `新版本 ${info.version} 已下載完成，將自動重新啟動套用更新`
    });

    showDesktopNotification(
      "Han Burger Desktop 更新已下載",
      `新版本 ${info.version} 已下載完成，將自動重新啟動套用更新。`
    );

    if (autoRestartTimer) {
      clearTimeout(autoRestartTimer);
    }

    autoRestartTimer = setTimeout(() => {
      writePendingUpdateMarker(info.version);
      autoUpdater.quitAndInstall(false, true);
    }, AUTO_RESTART_DELAY_MS);
  });

  return {
    enabled: true,
    hasDownloadedUpdate: () => hasDownloadedUpdate,
    getStartupStatus: () => startupStatus,
    checkForUpdates: async () => {
      await autoUpdater.checkForUpdates();
      return {
        enabled: true,
        message: "已開始檢查更新"
      };
    },
    restartToApplyUpdate: () => {
      if (!hasDownloadedUpdate) {
        return false;
      }

      if (autoRestartTimer) {
        clearTimeout(autoRestartTimer);
      }

      writePendingUpdateMarker(downloadedVersion || app.getVersion());
      autoUpdater.quitAndInstall(false, true);
      return true;
    }
  };
}

module.exports = {
  configureUpdater
};
