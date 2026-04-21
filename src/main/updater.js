const { app } = require("electron");
const log = require("electron-log");
const { autoUpdater } = require("electron-updater");

function configureUpdater(mainWindow) {
  if (!app.isPackaged) {
    return {
      enabled: false,
      hasDownloadedUpdate: false,
      checkForUpdates: async () => ({
        enabled: false,
        message: "Updater is disabled in development mode."
      }),
      restartToApplyUpdate: () => false
    };
  }

  let hasDownloadedUpdate = false;

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
    mainWindow.webContents.send("update-status", {
      stage: "downloaded",
      currentVersion: app.getVersion(),
      latestVersion: info.version,
      downloaded: true,
      message: `新版本 ${info.version} 已下載，現在可重新啟動套用更新`
    });
  });

  return {
    enabled: true,
    hasDownloadedUpdate: () => hasDownloadedUpdate,
    checkForUpdates: async () => {
      await autoUpdater.checkForUpdates();
      return {
        enabled: true,
        message: "GitHub Releases update check started."
      };
    },
    restartToApplyUpdate: () => {
      if (!hasDownloadedUpdate) {
        return false;
      }

      autoUpdater.quitAndInstall();
      return true;
    }
  };
}

module.exports = {
  configureUpdater
};
