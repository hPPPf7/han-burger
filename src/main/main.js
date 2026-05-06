const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, ipcMain, Notification } = require("electron");
const { initializeStorage } = require("./paths");
const { createStore } = require("./store");
const {
  ensureProjectDirectories,
  installProjectFiles,
  uninstallProjectFiles,
  updateInstalledProjectFiles
} = require("./project-manager");
const { openGoogleSignIn } = require("./oauth");
const {
  readCalendarData,
  saveCalendarData
} = require("./calendar-sync");
const { configureUpdater } = require("./updater");
const {
  exportCrashReport,
  initializeCrashReports,
  listCrashReports,
  readCrashReport,
  writeCrashReport
} = require("./crash-reports");

let mainWindow;
let appPaths;
let store;
let updater;
const APP_USER_MODEL_ID = "com.hanburger.desktop";

function recordError(kind, error, details = {}) {
  try {
    writeCrashReport(kind, error, details);
  } catch {
    // Crash reporting must never crash the app.
  }
}

function sendToMainWindow(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#0f1415",
    show: false,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.on("did-finish-load", async () => {
    sendToMainWindow("window-state-changed", {
      isMaximized: mainWindow.isMaximized()
    });

    const startupUpdateStatus = updater?.getStartupStatus?.();
    if (startupUpdateStatus) {
      sendToMainWindow("update-status", startupUpdateStatus);

      if (Notification.isSupported()) {
        new Notification({
          title: "Han Burger Desktop 已完成更新",
          body: `目前版本 ${app.getVersion()}，已自動重新開啟。`
        }).show();
      }
    }

    if (updater) {
      await updater.checkForStartupUpdates();
    }

    updateInstalledProjects().catch((error) => {
      recordError("project-update-startup", error);
      sendToMainWindow("project-update-status", {
        projectId: null,
        stage: "error",
        message: `專案更新檢查失敗: ${error.message}`
      });
    });
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    recordError("renderer-process-gone", null, details);
  });

  mainWindow.webContents.on("unresponsive", () => {
    recordError("renderer-unresponsive", null);
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    recordError("renderer-did-fail-load", null, {
      errorCode,
      errorDescription,
      validatedURL
    });
  });

  mainWindow.on("maximize", () => {
    sendToMainWindow("window-state-changed", {
      isMaximized: true
    });
  });

  mainWindow.on("unmaximize", () => {
    sendToMainWindow("window-state-changed", {
      isMaximized: false
    });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
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

async function installProject(projectId) {
  const projects = store.getProjects();
  const nextProjects = await Promise.all(projects.map(async (project) => {
    if (project.id !== projectId) {
      return project;
    }

    const installResult = await installProjectFiles(project);

    return {
      ...project,
      installed: true,
      installedAt: new Date().toISOString(),
      installedVersion: installResult.installedVersion || project.availableVersion || project.installedVersion || "0.1.0"
    };
  }));

  store.saveProjects(nextProjects);
}

async function updateInstalledProject(projectId) {
  const projects = store.getProjects();
  let didUpdate = false;
  let didCheck = false;

  const nextProjects = await Promise.all(projects.map(async (project) => {
    if (project.id !== projectId || !project.installed) {
      return project;
    }

    didCheck = true;
    const updateResult = await updateInstalledProjectFiles(project);

    if (!updateResult.updated) {
      return project;
    }

    didUpdate = true;
    return {
      ...project,
      installed: true,
      installedAt: project.installedAt || new Date().toISOString(),
      installedVersion: updateResult.installedVersion || project.installedVersion
    };
  }));

  if (didUpdate) {
    store.saveProjects(nextProjects);
    sendToMainWindow("projects-changed", getBootstrapData());
  }

  return {
    checked: didCheck,
    updated: didUpdate
  };
}

async function updateInstalledProjects() {
  const projects = store.getProjects();
  let didUpdate = false;

  const nextProjects = await Promise.all(projects.map(async (project) => {
    if (!project.installed) {
      return project;
    }

    try {
      const updateResult = await updateInstalledProjectFiles(project);
      if (!updateResult.updated) {
        return project;
      }

      didUpdate = true;
      return {
        ...project,
        installed: true,
        installedAt: project.installedAt || new Date().toISOString(),
        installedVersion: updateResult.installedVersion || project.installedVersion
      };
    } catch (error) {
      recordError("project-update-background", error, {
        projectId: project.id
      });
      sendToMainWindow("project-update-status", {
        projectId: project.id,
        stage: "error",
        message: `專案更新檢查失敗: ${error.message}`
      });
      return project;
    }
  }));

  if (didUpdate) {
    store.saveProjects(nextProjects);
    sendToMainWindow("projects-changed", getBootstrapData());
  }

  return {
    updated: didUpdate
  };
}

function registerIpc() {
  ipcMain.handle("bootstrap-data", async () => getBootstrapData());
  ipcMain.handle("get-project-entry", async (_event, projectId) => {
    try {
      await updateInstalledProject(projectId);
    } catch (error) {
      recordError("project-update-entry", error, {
        projectId
      });
      sendToMainWindow("project-update-status", {
        projectId,
        stage: "error",
        message: `專案更新檢查失敗，已改用本機版本: ${error.message}`
      });
    }

    const project = store.getProjects().find((item) => item.id === projectId);
    if (!project?.entryFilePath) {
      return null;
    }

    if (!fs.existsSync(project.entryFilePath)) {
      return {
        kind: "missing",
        title: project.name,
        html: null
      };
    }

    return {
      kind: "file",
      title: project.name,
      fileUrl: pathToFileURL(project.entryFilePath).toString()
    };
  });

  ipcMain.handle("sign-in-google", async () => {
    const config = store.getConfig();
    const signInResult = await openGoogleSignIn(config, appPaths);
    const user = signInResult.user;
    fs.mkdirSync(user.profilePath, { recursive: true });
    store.saveGoogleAuth(signInResult.auth);
    store.saveUser(user);

    const payload = getBootstrapData();
    sendToMainWindow("auth-changed", payload);
    return payload;
  });

  ipcMain.handle("sign-out", async () => {
    store.saveGoogleAuth(null);
    store.saveUser(null);
    const payload = getBootstrapData();
    sendToMainWindow("auth-changed", payload);
    return payload;
  });

  ipcMain.handle("install-project", async (_event, projectId) => {
    await installProject(projectId);
    return getBootstrapData();
  });

  ipcMain.handle("update-installed-projects", async () => {
    await updateInstalledProjects();
    return getBootstrapData();
  });

  ipcMain.handle("remove-project", async (_event, projectId) => {
    const nextProjects = store.getProjects().map((project) => {
      if (project.id !== projectId) {
        return project;
      }

      return {
        ...project,
        installed: false,
        installedAt: null,
        installedVersion: null
      };
    });

    const removedProject = nextProjects.find((project) => project.id === projectId);
    if (removedProject) {
      uninstallProjectFiles(removedProject);
    }

    store.saveProjects(nextProjects);
    return getBootstrapData();
  });

  ipcMain.handle("calendar-get-events", async () => {
    const result = await readCalendarData(appPaths, store.getConfig(), store);
    return {
      events: result.data.events,
      sync: result.sync
    };
  });

  ipcMain.handle("calendar-save-events", async (_event, events) => {
    const result = await saveCalendarData(appPaths, store.getConfig(), store, {
      version: 1,
      events
    });
    return {
      events: result.data.events,
      sync: result.sync
    };
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

  ipcMain.handle("list-crash-reports", async () => listCrashReports());
  ipcMain.handle("read-crash-report", async (_event, filePath) => readCrashReport(filePath));
  ipcMain.handle("export-crash-report", async (_event, filePath) => exportCrashReport(filePath));
  ipcMain.handle("record-renderer-error", async (_event, payload) => {
    recordError("renderer-error", payload?.message || "Renderer error", payload || {});
    return true;
  });
}

app.whenReady().then(() => {
  const lock = app.requestSingleInstanceLock();
  if (!lock) {
    app.quit();
    return;
  }

  app.setAppUserModelId(APP_USER_MODEL_ID);
  appPaths = initializeStorage();
  initializeCrashReports(appPaths.logsRoot);
  store = createStore(appPaths);
  registerIpc();
  updater = configureUpdater(() => mainWindow);
  createWindow();
  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
    }
  });
});

app.on("render-process-gone", (_event, webContents, details) => {
  recordError("app-render-process-gone", null, {
    url: webContents?.getURL?.() || null,
    ...details
  });
});

app.on("child-process-gone", (_event, details) => {
  recordError("child-process-gone", null, details);
});

process.on("uncaughtException", (error) => {
  recordError("uncaught-exception", error);
});

process.on("unhandledRejection", (reason) => {
  recordError("unhandled-rejection", reason);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
