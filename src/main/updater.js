const { app } = require("electron");
const log = require("electron-log");
const { autoUpdater } = require("electron-updater");

function configureUpdater(mainWindow) {
  if (!app.isPackaged) {
    return {
      enabled: false,
      checkForUpdates: async () => ({
        enabled: false,
        message: "Updater is disabled in development mode."
      })
    };
  }

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    mainWindow.webContents.send("update-status", {
      stage: "checking",
      message: "啟動時檢查更新中"
    });
  });

  autoUpdater.on("update-available", (info) => {
    mainWindow.webContents.send("update-status", {
      stage: "available",
      message: `發現新版本 ${info.version}，正在下載`
    });
  });

  autoUpdater.on("update-not-available", () => {
    mainWindow.webContents.send("update-status", {
      stage: "idle",
      message: "目前已是最新版本"
    });
  });

  autoUpdater.on("error", (error) => {
    mainWindow.webContents.send("update-status", {
      stage: "error",
      message: `更新檢查失敗: ${error.message}`
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    mainWindow.webContents.send("update-status", {
      stage: "downloading",
      message: `更新下載中 ${Math.round(progress.percent)}%`
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    mainWindow.webContents.send("update-status", {
      stage: "downloaded",
      message: `新版本 ${info.version} 已下載，重啟後會自動套用`
    });
  });

  return {
    enabled: true,
    checkForUpdates: async () => {
      await autoUpdater.checkForUpdatesAndNotify();
      return {
        enabled: true,
        message: "GitHub Releases update check started."
      };
    }
  };
}

module.exports = {
  configureUpdater
};
