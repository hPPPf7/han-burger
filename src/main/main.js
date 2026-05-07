const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, screen, Tray } = require("electron");
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
  saveCalendarData,
  uploadCalendarData
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
let calendarWidgetWindow = null;
let calendarWidgetTray = null;
let calendarWidgetOpacity = 0.96;
let calendarWidgetEmbedded = false;
let calendarWidgetScale = 1;
let calendarStartupSync = null;
let calendarStartupResult = null;
let isCalendarUploadBeforeCloseDone = false;
let isCalendarUploadBeforeCloseRunning = false;
const APP_USER_MODEL_ID = "com.hanburger.desktop";
const CALENDAR_WIDGET_SIZE = {
  width: 760,
  height: 620
};

function createCalendarTrayIcon() {
  return nativeImage.createFromDataURL(
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <rect x="5" y="6" width="22" height="21" rx="4" fill="#d6a84f"/>
        <rect x="5" y="10" width="22" height="4" fill="#2b2419"/>
        <path d="M11 4v5M21 4v5" stroke="#f5efe3" stroke-width="2" stroke-linecap="round"/>
        <path d="M11 18h3M18 18h3M11 23h3M18 23h3" stroke="#2b2419" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `)
  );
}

function updateCalendarWidgetTray() {
  if (!calendarWidgetWindow || calendarWidgetWindow.isDestroyed()) {
    if (calendarWidgetTray) {
      calendarWidgetTray.destroy();
      calendarWidgetTray = null;
    }
    return;
  }

  if (!calendarWidgetTray) {
    calendarWidgetTray = new Tray(createCalendarTrayIcon());
  }

  calendarWidgetTray.setToolTip("Han Burger Calendar 小工具");
  calendarWidgetTray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "顯示小工具",
      click: () => {
        if (calendarWidgetWindow && !calendarWidgetWindow.isDestroyed()) {
          calendarWidgetWindow.showInactive();
        }
      }
    },
    {
      label: "關閉小工具",
      click: () => closeCalendarWidget()
    }
  ]));
}

function recordError(kind, error, details = {}) {
  try {
    const reportPath = writeCrashReport(kind, error, details);
    sendToMainWindow("crash-report-created", {
      kind,
      path: reportPath,
      createdAt: new Date().toISOString()
    });
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

function sendToCalendarWidget(channel, payload) {
  if (!calendarWidgetWindow || calendarWidgetWindow.isDestroyed()) {
    return;
  }

  calendarWidgetWindow.webContents.send(channel, payload);
}

function broadcastCalendarEvents(payload) {
  sendToMainWindow("calendar-events-changed", payload);
  sendToCalendarWidget("calendar-events-changed", payload);
}

function getSavedWindowOptions() {
  const savedState = store?.getWindowState?.();
  const bounds = savedState?.bounds || {};

  return {
    width: Number.isFinite(bounds.width) ? Math.max(1180, bounds.width) : 1440,
    height: Number.isFinite(bounds.height) ? Math.max(760, bounds.height) : 920,
    x: Number.isFinite(bounds.x) ? bounds.x : undefined,
    y: Number.isFinite(bounds.y) ? bounds.y : undefined,
    isMaximized: Boolean(savedState?.isMaximized)
  };
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed() || !store) {
    return;
  }

  store.saveWindowState({
    bounds: mainWindow.isMaximized() ? mainWindow.getNormalBounds() : mainWindow.getBounds(),
    isMaximized: mainWindow.isMaximized()
  });
}

function startCalendarStartupSync(force = false) {
  if (calendarStartupSync && !force) {
    return calendarStartupSync;
  }

  calendarStartupSync = readCalendarData(appPaths, store.getConfig(), store)
    .then((result) => {
      calendarStartupResult = result;
      return result;
    })
    .catch((error) => {
      calendarStartupResult = {
        data: { version: 1, events: [] },
        sync: {
          provider: "google-drive",
          ok: false,
          message: error.message
        }
      };
      return calendarStartupResult;
    });

  return calendarStartupSync;
}

function toCalendarPayload(result, pending = false) {
  return {
    events: result.data.events,
    sync: {
      ...result.sync,
      pending
    }
  };
}

async function getCalendarPayload({ forceRefresh = false } = {}) {
  const pending = Boolean(calendarStartupSync && !calendarStartupResult);
  const result = forceRefresh || !calendarStartupResult
    ? await startCalendarStartupSync(forceRefresh)
    : calendarStartupResult;

  return toCalendarPayload(result, pending);
}

async function uploadCalendarBeforeClose() {
  sendToMainWindow("closing-sync-status", {
    stage: "uploading",
    message: "正在上傳 Calendar 同步資料，上傳完成後會自動關閉。"
  });

  const result = await uploadCalendarData(appPaths, store.getConfig(), store, {
    skipUnchanged: true
  });
  calendarStartupResult = result;

  sendToMainWindow("closing-sync-status", {
    stage: result.sync?.ok ? "done" : "error",
    message: result.sync?.ok
      ? "Calendar 同步上傳完成，正在關閉。"
      : `Calendar 同步上傳失敗，仍會關閉：${result.sync?.message || "未知錯誤"}`
  });
}

function getCalendarProject() {
  return store.getProjects().find((item) => item.id === "han-burger-calendar");
}

function getWindowHandleValue(window) {
  const handle = window.getNativeWindowHandle();
  if (handle.length >= 8 && typeof handle.readBigUInt64LE === "function") {
    return handle.readBigUInt64LE(0).toString();
  }

  return handle.readUInt32LE(0).toString();
}

function embedWindowIntoWindowsDesktop(window) {
  if (process.platform !== "win32") {
    return Promise.resolve(false);
  }

  const handleValue = getWindowHandleValue(window);
  const bounds = window.getBounds();
  const script = `
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class DesktopHost {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
  [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, UInt32 Msg, IntPtr wParam, IntPtr lParam, UInt32 fuFlags, UInt32 uTimeout, out IntPtr lpdwResult);
  [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);
  [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, UInt32 uFlags);
}
"@
    $child = [IntPtr]::new([Int64]${handleValue})
    $x = ${Math.round(bounds.x)}
    $y = ${Math.round(bounds.y)}
    $width = ${Math.round(bounds.width)}
    $height = ${Math.round(bounds.height)}
    $progman = [DesktopHost]::FindWindow("Progman", $null)
    if ($progman -ne [IntPtr]::Zero) {
      $unused = [IntPtr]::Zero
      [DesktopHost]::SendMessageTimeout($progman, 0x052C, [IntPtr]::Zero, [IntPtr]::Zero, 0, 1000, [ref]$unused) | Out-Null
    }
    $script:workerw = [IntPtr]::Zero
    [DesktopHost+EnumWindowsProc]$callback = {
      param([IntPtr]$topHandle, [IntPtr]$topParam)
      $shellView = [DesktopHost]::FindWindowEx($topHandle, [IntPtr]::Zero, "SHELLDLL_DefView", $null)
      if ($shellView -ne [IntPtr]::Zero) {
        $script:workerw = [DesktopHost]::FindWindowEx([IntPtr]::Zero, $topHandle, "WorkerW", $null)
      }
      return $true
    }
    [DesktopHost]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
    if ($script:workerw -eq [IntPtr]::Zero) {
      $script:workerw = $progman
    }
    if ($script:workerw -eq [IntPtr]::Zero) {
      Write-Output "NO_WORKERW"
      exit 0
    }
    $GWL_STYLE = -16
    $WS_CHILD = [Int64]0x40000000
    $WS_VISIBLE = [Int64]0x10000000
    $WS_POPUP = [Int64]0x80000000
    $style = [DesktopHost]::GetWindowLongPtr($child, $GWL_STYLE).ToInt64()
    $style = ($style -band (-bnot $WS_POPUP)) -bor $WS_CHILD -bor $WS_VISIBLE
    [DesktopHost]::SetWindowLongPtr($child, $GWL_STYLE, [IntPtr]::new($style)) | Out-Null
    [DesktopHost]::SetParent($child, $script:workerw) | Out-Null
    [DesktopHost]::SetWindowPos($child, [IntPtr]::Zero, $x, $y, $width, $height, 0x0250) | Out-Null
  `;

  return new Promise((resolve, reject) => {
    execFile("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script
    ], {
      windowsHide: true
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || stdout || error.message).trim()));
        return;
      }

      resolve(!stdout.includes("NO_WORKERW"));
    });
  });
}

async function openCalendarWidget(theme = "dark") {
  const project = getCalendarProject();
  if (!project?.entryFilePath || !fs.existsSync(project.entryFilePath)) {
    throw new Error("Calendar 尚未安裝，無法開啟桌面小工具。");
  }

  if (calendarWidgetWindow && !calendarWidgetWindow.isDestroyed()) {
    calendarWidgetWindow.setAlwaysOnTop(false);
    return {
      opened: true,
      embedded: calendarWidgetEmbedded,
      opacity: calendarWidgetOpacity,
      scale: calendarWidgetScale
    };
  }

  const widgetUrl = new URL(pathToFileURL(project.entryFilePath).toString());
  widgetUrl.searchParams.set("widget", "1");
  widgetUrl.searchParams.set("theme", theme === "light" ? "light" : "dark");
  widgetUrl.searchParams.set("opacity", String(Math.round(calendarWidgetOpacity * 100)));
  widgetUrl.searchParams.set("scale", String(Math.round(calendarWidgetScale * 100)));

  const workArea = screen.getPrimaryDisplay().workArea;
  const widgetBounds = {
    width: Math.round(CALENDAR_WIDGET_SIZE.width * calendarWidgetScale),
    height: Math.round(CALENDAR_WIDGET_SIZE.height * calendarWidgetScale),
    x: workArea.x + 24,
    y: workArea.y + 24
  };

  calendarWidgetWindow = new BrowserWindow({
    width: widgetBounds.width,
    height: widgetBounds.height,
    x: widgetBounds.x,
    y: widgetBounds.y,
    minWidth: Math.round(CALENDAR_WIDGET_SIZE.width * 0.65),
    minHeight: Math.round(CALENDAR_WIDGET_SIZE.height * 0.65),
    title: "Han Burger Calendar",
    backgroundColor: theme === "light" ? "#efe7d8" : "#0e0c0a",
    show: false,
    frame: process.platform !== "win32",
    resizable: process.platform !== "win32",
    movable: process.platform !== "win32",
    minimizable: process.platform !== "win32",
    maximizable: false,
    skipTaskbar: process.platform === "win32",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  calendarWidgetWindow.setOpacity(calendarWidgetOpacity);

  calendarWidgetWindow.on("closed", () => {
    calendarWidgetWindow = null;
    calendarWidgetEmbedded = false;
    updateCalendarWidgetTray();
  });

  await calendarWidgetWindow.loadURL(widgetUrl.toString());
  let embedded = false;
  try {
    embedded = await embedWindowIntoWindowsDesktop(calendarWidgetWindow);
  } catch (error) {
    recordError("calendar-widget-desktop-embed", error);
  }

  calendarWidgetEmbedded = embedded;
  if (!embedded) {
    calendarWidgetWindow.showInactive();
  }
  calendarWidgetWindow.setAlwaysOnTop(false);
  updateCalendarWidgetTray();
  return { opened: true, embedded, opacity: calendarWidgetOpacity, scale: calendarWidgetScale };
}

function closeCalendarWidget() {
  if (calendarWidgetWindow && !calendarWidgetWindow.isDestroyed()) {
    calendarWidgetWindow.close();
  }
  calendarWidgetEmbedded = false;
  updateCalendarWidgetTray();

  return { closed: true };
}

function moveCalendarWidget(deltaX, deltaY) {
  if (!calendarWidgetWindow || calendarWidgetWindow.isDestroyed()) {
    return { moved: false };
  }

  const bounds = calendarWidgetWindow.getBounds();
  const nextBounds = {
    ...bounds,
    x: bounds.x + Math.round(Number(deltaX) || 0),
    y: bounds.y + Math.round(Number(deltaY) || 0)
  };
  calendarWidgetWindow.setBounds(nextBounds, false);
  return { moved: true, bounds: nextBounds };
}

function setCalendarWidgetOpacity(value) {
  const opacity = Math.min(1, Math.max(0.35, Number(value) || calendarWidgetOpacity));
  calendarWidgetOpacity = opacity;

  if (calendarWidgetWindow && !calendarWidgetWindow.isDestroyed()) {
    calendarWidgetWindow.setOpacity(opacity);
  }

  return { opacity };
}

function setCalendarWidgetScale(value) {
  const scale = Math.min(1.5, Math.max(0.65, Number(value) || calendarWidgetScale));
  calendarWidgetScale = scale;

  if (!calendarWidgetWindow || calendarWidgetWindow.isDestroyed()) {
    return { scale };
  }

  const bounds = calendarWidgetWindow.getBounds();
  const nextWidth = Math.round(CALENDAR_WIDGET_SIZE.width * scale);
  const nextHeight = Math.round(CALENDAR_WIDGET_SIZE.height * scale);
  calendarWidgetWindow.setBounds({
    ...bounds,
    width: nextWidth,
    height: nextHeight
  }, false);

  return {
    scale,
    bounds: calendarWidgetWindow.getBounds()
  };
}

function createWindow() {
  const windowOptions = getSavedWindowOptions();
  isCalendarUploadBeforeCloseDone = false;
  isCalendarUploadBeforeCloseRunning = false;
  mainWindow = new BrowserWindow({
    width: windowOptions.width,
    height: windowOptions.height,
    x: windowOptions.x,
    y: windowOptions.y,
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

  if (windowOptions.isMaximized) {
    mainWindow.maximize();
  }

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

    startCalendarStartupSync();

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
    saveWindowState();
    sendToMainWindow("window-state-changed", {
      isMaximized: true
    });
  });

  mainWindow.on("unmaximize", () => {
    saveWindowState();
    sendToMainWindow("window-state-changed", {
      isMaximized: false
    });
  });

  mainWindow.on("resize", saveWindowState);
  mainWindow.on("move", saveWindowState);

  mainWindow.on("close", async (event) => {
    saveWindowState();

    if (isCalendarUploadBeforeCloseDone || isCalendarUploadBeforeCloseRunning) {
      return;
    }

    event.preventDefault();
    isCalendarUploadBeforeCloseRunning = true;

    try {
      await uploadCalendarBeforeClose();
    } catch (error) {
      recordError("calendar-upload-before-close", error);
      sendToMainWindow("closing-sync-status", {
        stage: "error",
        message: `Calendar 同步上傳失敗，仍會關閉：${error.message}`
      });
    } finally {
      isCalendarUploadBeforeCloseDone = true;
      isCalendarUploadBeforeCloseRunning = false;
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.close();
        }
      }, 400);
    }
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
    return getCalendarPayload();
  });

  ipcMain.handle("calendar-save-events", async (_event, events) => {
    const result = await saveCalendarData(appPaths, store.getConfig(), store, {
      version: 1,
      events
    });
    calendarStartupResult = result;
    const payload = toCalendarPayload(result);
    broadcastCalendarEvents(payload);
    return payload;
  });

  ipcMain.handle("calendar-download-events", async () => {
    return getCalendarPayload({ forceRefresh: true });
  });

  ipcMain.handle("calendar-upload-events", async (_event, events) => {
    await saveCalendarData(appPaths, store.getConfig(), store, {
      version: 1,
      events
    });
    const result = await uploadCalendarData(appPaths, store.getConfig(), store);
    calendarStartupResult = result;
    const payload = toCalendarPayload(result);
    broadcastCalendarEvents(payload);
    return payload;
  });

  ipcMain.handle("calendar-open-widget", async (_event, theme) => openCalendarWidget(theme));
  ipcMain.handle("calendar-close-widget", async () => closeCalendarWidget());
  ipcMain.handle("calendar-move-widget", async (_event, deltaX, deltaY) => moveCalendarWidget(deltaX, deltaY));
  ipcMain.handle("calendar-set-widget-opacity", async (_event, value) => setCalendarWidgetOpacity(value));
  ipcMain.handle("calendar-set-widget-scale", async (_event, value) => setCalendarWidgetScale(value));

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
