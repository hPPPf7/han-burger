const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function syncConfigFromTemplate(appConfigPath, configTemplatePath) {
  if (!fs.existsSync(configTemplatePath)) {
    return;
  }

  if (!fs.existsSync(appConfigPath)) {
    fs.copyFileSync(configTemplatePath, appConfigPath);
    return;
  }

  const currentConfig = readJsonSafe(appConfigPath);
  const templateConfig = readJsonSafe(configTemplatePath);
  if (!currentConfig || !templateConfig) {
    return;
  }

  const nextConfig = {
    ...currentConfig,
    googleOAuth: {
      ...(currentConfig.googleOAuth || {})
    }
  };

  let didChange = false;

  const currentOAuth = currentConfig.googleOAuth || {};
  const templateOAuth = templateConfig.googleOAuth || {};

  if (!currentOAuth.clientId && templateOAuth.clientId) {
    nextConfig.googleOAuth.clientId = templateOAuth.clientId;
    didChange = true;
  }

  if (!currentOAuth.clientSecret && templateOAuth.clientSecret) {
    nextConfig.googleOAuth.clientSecret = templateOAuth.clientSecret;
    didChange = true;
  }

  if ((!Array.isArray(currentOAuth.scopes) || currentOAuth.scopes.length === 0) && Array.isArray(templateOAuth.scopes)) {
    nextConfig.googleOAuth.scopes = templateOAuth.scopes;
    didChange = true;
  }

  if (didChange) {
    fs.writeFileSync(appConfigPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
  }
}

function syncProjectsFromTemplate(projectsPath, projectsTemplatePath) {
  if (!fs.existsSync(projectsTemplatePath)) {
    return;
  }

  const currentProjects = readJsonSafe(projectsPath);
  const templateProjects = readJsonSafe(projectsTemplatePath);
  if (!Array.isArray(currentProjects) || !Array.isArray(templateProjects)) {
    return;
  }

  const currentIds = new Set(currentProjects.map((project) => project?.id).filter(Boolean));
  const missingProjects = templateProjects.filter((project) => project?.id && !currentIds.has(project.id));
  if (missingProjects.length === 0) {
    return;
  }

  fs.writeFileSync(
    projectsPath,
    `${JSON.stringify([...currentProjects, ...missingProjects], null, 2)}\n`,
    "utf8"
  );
}

function getExecutableRoot() {
  if (app.isPackaged) {
    return path.dirname(app.getPath("exe"));
  }

  return path.resolve(__dirname, "..", "..");
}

function getAppDataPath() {
  try {
    return app.getPath("appData");
  } catch {
    return "";
  }
}

function getDataRoot(executableRoot) {
  if (!app.isPackaged) {
    return path.join(executableRoot, "app-data");
  }

  const appDataPath = getAppDataPath();
  if (appDataPath) {
    const sharedDataRootPath = readTextSafe(path.join(appDataPath, "han-burger-desktop", "data-root.txt"));
    if (sharedDataRootPath) {
      return path.resolve(sharedDataRootPath);
    }
  }

  const dataRootPath = readTextSafe(path.join(app.getPath("userData"), "data-root.txt"));
  if (dataRootPath) {
    return path.resolve(dataRootPath);
  }

  const dataRootConfigPath = path.join(app.getPath("userData"), "data-root.json");
  const dataRootConfig = readJsonSafe(dataRootConfigPath);
  if (typeof dataRootConfig?.dataRoot === "string" && dataRootConfig.dataRoot.trim()) {
    return path.resolve(dataRootConfig.dataRoot);
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
    try {
      fs.cpSync(templateRoot, targetRoot, { recursive: true, dereference: true });
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    return;
  }

  for (const entry of fs.readdirSync(templateRoot, { withFileTypes: true })) {
    const sourcePath = path.join(templateRoot, entry.name);
    const targetPath = path.join(targetRoot, entry.name);

    if (!fs.existsSync(sourcePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      if (!fs.existsSync(targetPath)) {
        try {
          fs.cpSync(sourcePath, targetPath, { recursive: true, dereference: true });
        } catch (error) {
          if (error.code !== "ENOENT") {
            throw error;
          }
        }
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
  syncConfigFromTemplate(appConfigPath, configTemplatePath);

  const projectsTemplatePath = path.join(paths.templateRoot, "config", "projects.json");
  const projectsPath = path.join(paths.configRoot, "projects.json");
  syncProjectsFromTemplate(projectsPath, projectsTemplatePath);

  return paths;
}

module.exports = {
  getAppPaths,
  initializeStorage
};
