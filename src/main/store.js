const fs = require("node:fs");
const path = require("node:path");

const DEPRECATED_PROJECT_IDENTIFIERS = new Set([
  "core-dashboard",
  "core dashboard",
  "sample-tools",
  "sample tools"
]);

function isDeprecatedProject(project) {
  return [project.id, project.name]
    .filter(Boolean)
    .some((value) => DEPRECATED_PROJECT_IDENTIFIERS.has(String(value).toLowerCase()));
}

function readJson(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) {
    return fallbackValue;
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return fallbackValue;
  }

  return JSON.parse(raw);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createStore(paths) {
  const files = {
    appConfig: path.join(paths.configRoot, "app-config.json"),
    googleAuth: path.join(paths.configRoot, "google-auth.json"),
    projects: path.join(paths.configRoot, "projects.json"),
    user: path.join(paths.configRoot, "user.json"),
    windowState: path.join(paths.configRoot, "window-state.json")
  };

  function isPathInsideRoot(rootPath, targetPath) {
    const relativePath = path.relative(rootPath, targetPath);
    return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
  }

  function realpathIfExists(filePath) {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    return fs.realpathSync.native(filePath);
  }

  function resolvePathThroughExistingSegments(candidatePath) {
    const resolvedCandidatePath = path.resolve(candidatePath);
    const parsedPath = path.parse(resolvedCandidatePath);
    const trailingSegments = [];
    let currentPath = resolvedCandidatePath;

    while (currentPath !== parsedPath.root && !fs.existsSync(currentPath)) {
      trailingSegments.unshift(path.basename(currentPath));
      currentPath = path.dirname(currentPath);
    }

    const canonicalBasePath = realpathIfExists(currentPath) || path.resolve(currentPath);
    return trailingSegments.reduce(
      (accumulator, segment) => path.join(accumulator, segment),
      canonicalBasePath
    );
  }

  function ensureManagedPath(rootPath, targetPath, label, projectId) {
    const canonicalRootPath = resolvePathThroughExistingSegments(rootPath);
    const canonicalTargetPath = resolvePathThroughExistingSegments(targetPath);

    if (!isPathInsideRoot(canonicalRootPath, canonicalTargetPath)) {
      throw new Error(`Invalid ${label} for project "${projectId}". It must stay within ${canonicalRootPath}.`);
    }

    return path.resolve(targetPath);
  }

  function normalizeRelativeDataPath(filePath) {
    if (!filePath) {
      return filePath;
    }

    const normalizedFilePath = filePath.replaceAll("\\", "/");
    return normalizedFilePath.startsWith("app-data/")
      ? normalizedFilePath.slice("app-data/".length)
      : normalizedFilePath;
  }

  function resolveManagedPath(filePath, rootPath, label, projectId) {
    if (!filePath) {
      return filePath;
    }

    const candidatePath = path.isAbsolute(filePath)
      ? path.resolve(filePath)
      : path.resolve(paths.dataRoot, normalizeRelativeDataPath(filePath));

    return ensureManagedPath(rootPath, candidatePath, label, projectId);
  }

  function relativizeDataPath(filePath, label, projectId) {
    if (!filePath) {
      return filePath;
    }

    const absolutePath = path.isAbsolute(filePath)
      ? path.resolve(filePath)
      : path.resolve(paths.dataRoot, normalizeRelativeDataPath(filePath));

    const managedAbsolutePath = ensureManagedPath(paths.dataRoot, absolutePath, label, projectId);

    return path.relative(paths.dataRoot, managedAbsolutePath).replaceAll("\\", "/");
  }

  function getConfig() {
    const fallbackConfig = {
      googleOAuth: {
        clientId: "",
        clientSecret: "",
        scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/drive.appdata"]
      }
    };

    const config = readJson(files.appConfig, fallbackConfig);
    if (!fs.existsSync(files.appConfig)) {
      writeJson(files.appConfig, config);
    }

    return {
      ...fallbackConfig,
      ...config,
      googleOAuth: {
        ...fallbackConfig.googleOAuth,
        ...(config.googleOAuth || {})
      },
      updates: {
        ...fallbackConfig.updates,
        ...(config.updates || {})
      }
    };
  }

  function getProjects() {
    const projects = readJson(files.projects, []);
    return projects
      .filter((project) => !isDeprecatedProject(project))
      .map((project) => ({
        ...project,
        storagePath: resolveManagedPath(project.storagePath, paths.projectsRoot, "storagePath", project.id),
        entryFilePath: resolveManagedPath(project.entryFilePath, paths.projectsRoot, "entryFilePath", project.id),
        installSourcePath: resolveManagedPath(project.installSourcePath, paths.dataRoot, "installSourcePath", project.id)
      }));
  }

  function saveProjects(projects) {
    const relativeProjects = projects
      .filter((project) => !isDeprecatedProject(project))
      .map((project) => ({
        ...project,
        storagePath: relativizeDataPath(project.storagePath, "storagePath", project.id),
        entryFilePath: relativizeDataPath(project.entryFilePath, "entryFilePath", project.id),
        installSourcePath: relativizeDataPath(project.installSourcePath, "installSourcePath", project.id)
      }));

    writeJson(files.projects, relativeProjects);
  }

  function getUser() {
    return readJson(files.user, null);
  }

  function saveUser(user) {
    writeJson(files.user, user);
  }

  function getWindowState() {
    return readJson(files.windowState, null);
  }

  function saveWindowState(windowState) {
    writeJson(files.windowState, windowState);
  }

  function getGoogleAuth() {
    return readJson(files.googleAuth, null);
  }

  function saveGoogleAuth(auth) {
    writeJson(files.googleAuth, auth);
  }

  return {
    files,
    getConfig,
    getGoogleAuth,
    getProjects,
    saveProjects,
    saveGoogleAuth,
    getUser,
    saveUser,
    getWindowState,
    saveWindowState
  };
}

module.exports = {
  createStore
};
