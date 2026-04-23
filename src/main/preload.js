const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hanBurger", {
  getBootstrapData: () => ipcRenderer.invoke("bootstrap-data"),
  getProjectEntry: (projectId) => ipcRenderer.invoke("get-project-entry", projectId),
  signInWithGoogle: () => ipcRenderer.invoke("sign-in-google"),
  signOut: () => ipcRenderer.invoke("sign-out"),
  installProject: (projectId) => ipcRenderer.invoke("install-project", projectId),
  removeProject: (projectId) => ipcRenderer.invoke("remove-project", projectId),
  triggerUpdateCheck: () => ipcRenderer.invoke("trigger-update-check"),
  restartAndInstallUpdate: () => ipcRenderer.invoke("restart-and-install-update"),
  minimizeWindow: () => ipcRenderer.invoke("window-minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window-maximize"),
  closeWindow: () => ipcRenderer.invoke("window-close"),
  onAuthChanged: (callback) => ipcRenderer.on("auth-changed", (_event, payload) => callback(payload)),
  onUpdateStatus: (callback) => ipcRenderer.on("update-status", (_event, payload) => callback(payload)),
  onWindowStateChanged: (callback) => ipcRenderer.on("window-state-changed", (_event, payload) => callback(payload))
});
