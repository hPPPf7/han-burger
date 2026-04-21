const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hanBurger", {
  getBootstrapData: () => ipcRenderer.invoke("bootstrap-data"),
  signInWithGoogle: () => ipcRenderer.invoke("sign-in-google"),
  signOut: () => ipcRenderer.invoke("sign-out"),
  installProject: () => ipcRenderer.invoke("install-project"),
  removeProject: (projectId) => ipcRenderer.invoke("remove-project", projectId),
  triggerUpdateCheck: () => ipcRenderer.invoke("trigger-update-check"),
  minimizeWindow: () => ipcRenderer.invoke("window-minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window-maximize"),
  closeWindow: () => ipcRenderer.invoke("window-close"),
  onAuthChanged: (callback) => ipcRenderer.on("auth-changed", (_event, payload) => callback(payload)),
  onUpdateStatus: (callback) => ipcRenderer.on("update-status", (_event, payload) => callback(payload)),
  onWindowStateChanged: (callback) => ipcRenderer.on("window-state-changed", (_event, payload) => callback(payload))
});
