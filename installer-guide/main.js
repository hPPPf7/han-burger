const path = require("node:path");
const fs = require("node:fs");
const https = require("node:https");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");

const releaseApiUrl = "https://api.github.com/repos/hPPPf7/han-burger/releases/latest";
const sharedConfigDirName = "han-burger-desktop";

function sendInstallProgress(webContents, payload) {
  webContents.send("installer:install-progress", payload);
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "Han-Burger-Installer"
      }
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        requestJson(response.headers.location).then(resolve, reject);
        return;
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`GitHub release request failed: ${response.statusCode}`));
        return;
      }

      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on("error", reject);
  });
}

function downloadFile(url, targetPath, onProgress) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        "User-Agent": "Han-Burger-Installer"
      }
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadFile(response.headers.location, targetPath, onProgress).then(resolve, reject);
        return;
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`Installer download failed: ${response.statusCode}`));
        return;
      }

      const totalBytes = Number(response.headers["content-length"] || 0);
      let receivedBytes = 0;
      const file = fs.createWriteStream(targetPath);

      response.on("data", (chunk) => {
        receivedBytes += chunk.length;
        if (totalBytes > 0) {
          onProgress(Math.round((receivedBytes / totalBytes) * 100));
        }
      });

      response.pipe(file);
      file.on("finish", () => {
        file.close(resolve);
      });
      file.on("error", reject);
    });

    request.on("error", reject);
  });
}

function runInstaller(installerPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(installerPath, ["/S"], {
      detached: false,
      stdio: "ignore"
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Installer exited with code ${code}`));
    });
  });
}

function launchDesktop() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    throw new Error("LOCALAPPDATA is not available.");
  }

  const executablePath = path.join(localAppData, "Programs", "Han Burger Desktop", "Han Burger Desktop.exe");
  if (!fs.existsSync(executablePath)) {
    throw new Error(`Installed app not found: ${executablePath}`);
  }

  const child = spawn(executablePath, [], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
}

function writeDataRoot(dataRoot) {
  fs.mkdirSync(dataRoot, { recursive: true });

  const configDir = path.join(app.getPath("appData"), sharedConfigDirName);
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, "data-root.txt"), dataRoot, "utf8");
}

function createWindow() {
  const window = new BrowserWindow({
    width: 860,
    height: 580,
    minWidth: 820,
    minHeight: 540,
    backgroundColor: "#090807",
    frame: false,
    title: "Han Burger Installer",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.loadFile(path.join(__dirname, "index.html"));
}

ipcMain.handle("installer:select-folder", async (_event, title) => {
  const result = await dialog.showOpenDialog({
    title,
    properties: ["openDirectory", "createDirectory"]
  });

  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("installer:install-desktop", async (event, options) => {
  const dataRoot = String(options?.dataRoot || "").trim();
  const autoOpen = Boolean(options?.autoOpen);

  if (!dataRoot) {
    throw new Error("請選擇 Han Burger 資料位置。");
  }

  sendInstallProgress(event.sender, {
    percent: 6,
    title: "正在寫入設定",
    copy: "正在建立 Han Burger 資料夾並寫入主程式會讀取的位置。"
  });
  writeDataRoot(dataRoot);

  sendInstallProgress(event.sender, {
    percent: 12,
    title: "正在取得最新版本",
    copy: "正在讀取 GitHub Release 的最新 Han Burger Desktop 安裝包。"
  });
  const release = await requestJson(releaseApiUrl);
  const asset = release.assets?.find((item) => /^Han-Burger-Desktop-.+-setup\.exe$/.test(item.name));
  if (!asset?.browser_download_url) {
    throw new Error("找不到 Han Burger Desktop 安裝包。");
  }

  const downloadDir = path.join(app.getPath("temp"), "han-burger-installer");
  fs.mkdirSync(downloadDir, { recursive: true });
  const installerPath = path.join(downloadDir, asset.name);

  await downloadFile(asset.browser_download_url, installerPath, (downloadPercent) => {
    sendInstallProgress(event.sender, {
      percent: 12 + Math.round(downloadPercent * 0.58),
      title: "正在下載安裝包",
      copy: `正在下載 ${asset.name}。`
    });
  });

  sendInstallProgress(event.sender, {
    percent: 74,
    title: "正在啟動正式安裝器",
    copy: "正在以背景模式執行 Han Burger Desktop NSIS 安裝器。"
  });
  await runInstaller(installerPath);

  sendInstallProgress(event.sender, {
    percent: 94,
    title: autoOpen ? "正在開啟 Han Burger Desktop" : "安裝完成",
    copy: autoOpen ? "安裝完成，正在開啟主程式。" : "安裝完成，稍後可從開始選單開啟。"
  });

  if (autoOpen) {
    launchDesktop();
  }

  sendInstallProgress(event.sender, {
    percent: 100,
    title: "安裝完成",
    copy: autoOpen ? "Han Burger Desktop 已安裝並開啟，可以關閉此視窗。" : "Han Burger Desktop 已安裝完成，可以關閉此視窗。"
  });

  return { ok: true };
});

ipcMain.handle("installer:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.handle("installer:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
