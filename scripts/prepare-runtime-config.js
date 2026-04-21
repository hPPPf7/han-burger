const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const sourceConfigPath = path.join(rootDir, "app-data", "config", "app-config.json");
const fallbackConfigPath = path.join(rootDir, "app-config.example.json");
const runtimeConfigDir = path.join(rootDir, "build", "runtime-config");
const runtimeConfigPath = path.join(runtimeConfigDir, "app-config.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function applyEnvironmentOverrides(config) {
  const nextConfig = structuredClone(config);
  const clientId = process.env.HAN_BURGER_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.HAN_BURGER_GOOGLE_CLIENT_SECRET;

  if (!nextConfig.googleOAuth) {
    nextConfig.googleOAuth = {};
  }

  if (clientId) {
    nextConfig.googleOAuth.clientId = clientId;
  }

  if (clientSecret) {
    nextConfig.googleOAuth.clientSecret = clientSecret;
  }

  return nextConfig;
}

const sourcePath = fs.existsSync(sourceConfigPath) ? sourceConfigPath : fallbackConfigPath;
const config = applyEnvironmentOverrides(readJson(sourcePath));

writeJson(runtimeConfigPath, config);
console.log(`Prepared runtime config from ${sourcePath}`);
