const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hanBurgerInstaller", {
  selectFolder: (title) => ipcRenderer.invoke("installer:select-folder", title),
  installDesktop: (options) => ipcRenderer.invoke("installer:install-desktop", options),
  onInstallProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("installer:install-progress", listener);
    return () => ipcRenderer.removeListener("installer:install-progress", listener);
  },
  minimize: () => ipcRenderer.invoke("installer:minimize"),
  close: () => ipcRenderer.invoke("installer:close")
});
