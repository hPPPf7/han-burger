const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, ipcMain, Notification } = require("electron");
const { initializeStorage } = require("./paths");
const { createStore } = require("./store");
const { openGoogleSignIn } = require("./oauth");
const { configureUpdater } = require("./updater");

let mainWindow;
let appPaths;
let store;
let updater;

function ensureProjectDirectories(projects) {
  for (const project of projects) {
    fs.mkdirSync(project.storagePath, { recursive: true });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#0f1415",
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  mainWindow.webContents.on("did-finish-load", async () => {
    mainWindow.webContents.send("window-state-changed", {
      isMaximized: mainWindow.isMaximized()
    });

    const startupUpdateStatus = updater?.getStartupStatus?.();
    if (startupUpdateStatus) {
      mainWindow.webContents.send("update-status", startupUpdateStatus);

      if (Notification.isSupported()) {
        new Notification({
          title: "Han Burger Desktop 已完成更新",
          body: `目前版本 ${app.getVersion()}，已自動重新開啟。`
        }).show();
      }
    }

    if (updater) {
      await updater.checkForUpdates();
    }
  });

  mainWindow.on("maximize", () => {
    mainWindow.webContents.send("window-state-changed", {
      isMaximized: true
    });
  });

  mainWindow.on("unmaximize", () => {
    mainWindow.webContents.send("window-state-changed", {
      isMaximized: false
    });
  });
}

function getBootstrapData() {
  const config = store.getConfig();
  const projects = store.getProjects();
  const user = store.getUser();
  ensureProjectDirectories(projects);

  return {
    config: {
      googleConfigured: Boolean(
        config.googleOAuth?.clientId &&
        config.googleOAuth.clientId !== "REPLACE_WITH_GOOGLE_DESKTOP_CLIENT_ID"
      ),
      updateFeedConfigured: true
    },
    appVersion: app.getVersion(),
    user,
    projects,
    paths: {
      executableRoot: appPaths.executableRoot,
      dataRoot: appPaths.dataRoot
    },
    notes: {
      desktopDistribution: "電腦端提供整個桌面版外框。",
      mobileDistribution: "手機端不提供桌面殼，每個專案需獨立下載安裝。"
    }
  };
}

function registerIpc() {
  ipcMain.handle("bootstrap-data", async () => getBootstrapData());

  ipcMain.handle("sign-in-google", async () => {
    const config = store.getConfig();
    const user = await openGoogleSignIn(config, appPaths);
    fs.mkdirSync(user.profilePath, { recursive: true });
    store.saveUser(user);

    const payload = getBootstrapData();
    mainWindow.webContents.send("auth-changed", payload);
    return payload;
  });

  ipcMain.handle("sign-out", async () => {
    store.saveUser(null);
    const payload = getBootstrapData();
    mainWindow.webContents.send("auth-changed", payload);
    return payload;
  });

  ipcMain.handle("install-project", async () => {
    const projects = store.getProjects();
    const nextIndex = projects.length + 1;
    const id = `custom-project-${nextIndex}`;
    const storagePath = path.join(appPaths.projectsRoot, id);

    const nextProject = {
      id,
      name: `Custom Project ${nextIndex}`,
      description: "示意專案。手機端請改走各專案獨立安裝，不跟桌面版綁在一起。",
      storagePath,
      desktopEnabled: true,
      mobileDistributedSeparately: true
    };

    fs.mkdirSync(storagePath, { recursive: true });
    store.saveProjects([...projects, nextProject]);
    return getBootstrapData();
  });

  ipcMain.handle("remove-project", async (_event, projectId) => {
    const projects = store.getProjects().filter((project) => project.id !== projectId);
    store.saveProjects(projects);
    return getBootstrapData();
  });

  ipcMain.handle("trigger-update-check", async () => {
    if (!updater) {
      return {
        enabled: false,
        message: "Updater not initialized."
      };
    }

    return updater.checkForUpdates();
  });

  ipcMain.handle("restart-and-install-update", async () => {
    if (!updater) {
      return false;
    }

    return updater.restartToApplyUpdate();
  });

  ipcMain.handle("window-minimize", async () => {
    mainWindow.minimize();
  });

  ipcMain.handle("window-maximize", async () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.handle("window-close", async () => {
    mainWindow.close();
  });
}

app.whenReady().then(() => {
  appPaths = initializeStorage();
  store = createStore(appPaths);
  createWindow();
  updater = configureUpdater(mainWindow);
  registerIpc();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
