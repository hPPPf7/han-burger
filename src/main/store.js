const fs = require("node:fs");
const path = require("node:path");

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
    projects: path.join(paths.configRoot, "projects.json"),
    user: path.join(paths.configRoot, "user.json")
  };

  function normalizeRelativeProjectPath(storagePath) {
    if (!storagePath) {
      return storagePath;
    }

    return storagePath.startsWith("app-data/")
      ? storagePath.slice("app-data/".length)
      : storagePath;
  }

  function getConfig() {
    const fallbackConfig = {
      googleOAuth: {
        clientId: "",
        clientSecret: "",
        scopes: ["openid", "email", "profile"]
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
    return projects.map((project) => ({
      ...project,
      storagePath: path.isAbsolute(project.storagePath)
        ? project.storagePath
        : path.join(paths.dataRoot, normalizeRelativeProjectPath(project.storagePath))
    }));
  }

  function saveProjects(projects) {
    const relativeProjects = projects.map((project) => ({
      ...project,
      storagePath: path.relative(paths.dataRoot, project.storagePath).replaceAll("\\", "/")
    }));

    writeJson(files.projects, relativeProjects);
  }

  function getUser() {
    return readJson(files.user, null);
  }

  function saveUser(user) {
    writeJson(files.user, user);
  }

  return {
    files,
    getConfig,
    getProjects,
    saveProjects,
    getUser,
    saveUser
  };
}

module.exports = {
  createStore
};
