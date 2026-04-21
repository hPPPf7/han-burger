const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function getExecutableRoot() {
  if (app.isPackaged) {
    return path.dirname(app.getPath("exe"));
  }

  return path.resolve(__dirname, "..", "..");
}

function getDataRoot(executableRoot) {
  if (!app.isPackaged) {
    return path.join(executableRoot, "app-data");
  }

  return path.join(app.getPath("userData"), "app-data");
}

function getTemplateRoot() {
  return path.resolve(__dirname, "..", "..", "build", "app-data");
}

function getConfigTemplatePath() {
  const runtimeConfigPath = path.resolve(__dirname, "..", "..", "build", "runtime-config", "app-config.json");
  if (fs.existsSync(runtimeConfigPath)) {
    return runtimeConfigPath;
  }

  return path.resolve(__dirname, "..", "..", "app-config.example.json");
}

function getAppPaths() {
  const executableRoot = getExecutableRoot();
  const dataRoot = getDataRoot(executableRoot);

  return {
    executableRoot,
    dataRoot,
    cacheRoot: path.join(dataRoot, "cache"),
    configRoot: path.join(dataRoot, "config"),
    logsRoot: path.join(dataRoot, "logs"),
    projectsRoot: path.join(dataRoot, "projects"),
    usersRoot: path.join(dataRoot, "users"),
    templateRoot: getTemplateRoot()
  };
}

function copyMissingEntries(templateRoot, targetRoot) {
  if (!fs.existsSync(templateRoot)) {
    return;
  }

  if (!fs.existsSync(targetRoot)) {
    fs.cpSync(templateRoot, targetRoot, { recursive: true });
    return;
  }

  for (const entry of fs.readdirSync(templateRoot, { withFileTypes: true })) {
    const sourcePath = path.join(templateRoot, entry.name);
    const targetPath = path.join(targetRoot, entry.name);

    if (entry.isDirectory()) {
      if (!fs.existsSync(targetPath)) {
        fs.cpSync(sourcePath, targetPath, { recursive: true });
      } else {
        copyMissingEntries(sourcePath, targetPath);
      }
      continue;
    }

    if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function initializeStorage() {
  const paths = getAppPaths();
  ensureDirectory(paths.executableRoot);
  copyMissingEntries(paths.templateRoot, paths.dataRoot);

  [
    paths.dataRoot,
    paths.cacheRoot,
    paths.configRoot,
    paths.logsRoot,
    paths.projectsRoot,
    paths.usersRoot
  ].forEach(ensureDirectory);

  const configTemplatePath = getConfigTemplatePath();
  const appConfigPath = path.join(paths.configRoot, "app-config.json");
  if (!fs.existsSync(appConfigPath) && fs.existsSync(configTemplatePath)) {
    fs.copyFileSync(configTemplatePath, appConfigPath);
  }

  return paths;
}

module.exports = {
  getAppPaths,
  initializeStorage
};
