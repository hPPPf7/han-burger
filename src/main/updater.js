const fs = require("node:fs");
const path = require("node:path");
const { app, Notification } = require("electron");
const log = require("electron-log");
const { autoUpdater } = require("electron-updater");

const AUTO_RESTART_DELAY_MS = 3000;
const STARTUP_UPDATE_TIMEOUT_MS = 8000;

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
      checkForStartupUpdates: async () => ({
        enabled: false,
        message: "Updater is disabled in development mode."
      }),
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
  let initialCheckResolver = null;
  let startupFlowActive = false;
  const startupStatus = readAppliedUpdateStatus();

  function emitUpdateStatus(payload) {
    mainWindow.webContents.send("update-status", {
      startupFlow: startupFlowActive,
      ...payload
    });
  }

  function resolveInitialCheck() {
    if (initialCheckResolver) {
      initialCheckResolver();
      initialCheckResolver = null;
    }
  }

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    emitUpdateStatus({
      stage: "checking",
      currentVersion: app.getVersion(),
      latestVersion: null,
      progressPercent: 0,
      downloaded: false,
      message: "正在檢查更新"
    });
  });

  autoUpdater.on("update-available", (info) => {
    emitUpdateStatus({
      stage: "available",
      currentVersion: app.getVersion(),
      latestVersion: info.version,
      progressPercent: 0,
      downloaded: false,
      message: `發現新版本 ${info.version}，正在自動下載`
    });
    resolveInitialCheck();
  });

  autoUpdater.on("update-not-available", () => {
    emitUpdateStatus({
      stage: "idle",
      currentVersion: app.getVersion(),
      latestVersion: app.getVersion(),
      progressPercent: 0,
      downloaded: false,
      message: `目前已是最新版本 ${app.getVersion()}`
    });
    startupFlowActive = false;
    resolveInitialCheck();
  });

  autoUpdater.on("error", (error) => {
    emitUpdateStatus({
      stage: "error",
      currentVersion: app.getVersion(),
      latestVersion: null,
      progressPercent: 0,
      downloaded: false,
      message: `更新檢查失敗: ${error.message}`
    });
    startupFlowActive = false;
    resolveInitialCheck();
  });

  autoUpdater.on("download-progress", (progress) => {
    emitUpdateStatus({
      stage: "downloading",
      currentVersion: app.getVersion(),
      latestVersion: null,
      progressPercent: Math.round(progress.percent),
      downloaded: false,
      message: `更新下載中 ${Math.round(progress.percent)}%`
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    hasDownloadedUpdate = true;
    downloadedVersion = info.version;
    emitUpdateStatus({
      stage: "downloaded",
      currentVersion: app.getVersion(),
      latestVersion: info.version,
      progressPercent: 100,
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

    emitUpdateStatus({
      stage: "installing",
      currentVersion: app.getVersion(),
      latestVersion: info.version,
      progressPercent: 100,
      downloaded: true,
      message: `即將重新啟動並套用新版本 ${info.version}`
    });

    autoRestartTimer = setTimeout(() => {
      writePendingUpdateMarker(info.version);
      autoUpdater.quitAndInstall(false, true);
    }, AUTO_RESTART_DELAY_MS);
  });

  return {
    enabled: true,
    hasDownloadedUpdate: () => hasDownloadedUpdate,
    getStartupStatus: () => startupStatus,
    checkForStartupUpdates: async () => {
      startupFlowActive = true;
      const initialCheckPromise = new Promise((resolve) => {
        initialCheckResolver = resolve;
      });
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve("timeout"), STARTUP_UPDATE_TIMEOUT_MS);
      });
      const startupCheckPromise = (async () => {
        await autoUpdater.checkForUpdates();
        return await initialCheckPromise;
      })();

      try {
        const result = await Promise.race([startupCheckPromise, timeoutPromise]);

        if (result === "timeout") {
          startupFlowActive = false;
          emitUpdateStatus({
            stage: "error",
            currentVersion: app.getVersion(),
            latestVersion: null,
            progressPercent: 0,
            downloaded: false,
            message: "更新檢查逾時，已先進入主畫面，可稍後再手動檢查。"
          });
        }
      } finally {
        resolveInitialCheck();
      }

      return {
        enabled: true,
        message: "已完成啟動更新檢查"
      };
    },
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
