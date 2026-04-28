const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { app } = require("electron");

let reportRoot = null;

function serializeError(error) {
  if (!error) {
    return "No error payload.";
  }

  if (error instanceof Error) {
    return [
      `name: ${error.name}`,
      `message: ${error.message}`,
      "stack:",
      error.stack || "(no stack)"
    ].join("\n");
  }

  if (typeof error === "object") {
    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

function getTimestamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function initializeCrashReports(logsRoot) {
  reportRoot = path.join(logsRoot, "crash-reports");
  fs.mkdirSync(reportRoot, { recursive: true });
  return reportRoot;
}

function getReportRoot() {
  if (reportRoot) {
    return reportRoot;
  }

  reportRoot = path.join(app.getPath("userData"), "app-data", "logs", "crash-reports");
  fs.mkdirSync(reportRoot, { recursive: true });
  return reportRoot;
}

function writeCrashReport(kind, error, details = {}) {
  const root = getReportRoot();
  const fileName = `${getTimestamp()}-${kind}.txt`;
  const filePath = path.join(root, fileName);
  const payload = [
    "Han Burger Desktop Error Report",
    `time: ${new Date().toISOString()}`,
    `kind: ${kind}`,
    `appVersion: ${app.getVersion?.() || "unknown"}`,
    `platform: ${process.platform} ${os.release()}`,
    `arch: ${process.arch}`,
    "",
    "details:",
    JSON.stringify(details, null, 2),
    "",
    "error:",
    serializeError(error),
    ""
  ].join("\n");

  fs.writeFileSync(filePath, payload, "utf8");
  return filePath;
}

function listCrashReports() {
  const root = getReportRoot();
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".txt"))
    .map((entry) => {
      const filePath = path.join(root, entry.name);
      const stats = fs.statSync(filePath);
      return {
        name: entry.name,
        path: filePath,
        size: stats.size,
        updatedAt: stats.mtime.toISOString()
      };
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function readCrashReport(filePath) {
  const root = getReportRoot();
  const resolved = path.resolve(filePath);
  const relative = path.relative(root, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid crash report path.");
  }

  return fs.readFileSync(resolved, "utf8");
}

function exportCrashReport(filePath) {
  const source = filePath || listCrashReports()[0]?.path;
  if (!source) {
    throw new Error("No crash report available.");
  }

  const target = path.join(app.getPath("downloads"), path.basename(source));
  fs.copyFileSync(source, target);
  return target;
}

module.exports = {
  exportCrashReport,
  initializeCrashReports,
  listCrashReports,
  readCrashReport,
  writeCrashReport
};
