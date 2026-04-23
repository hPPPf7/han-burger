const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { Readable } = require("node:stream");
const { promisify } = require("node:util");
const { execFile } = require("node:child_process");

const execFileAsync = promisify(execFile);

function escapePowerShellString(value) {
  return String(value).replaceAll("'", "''");
}

async function writeResponseBodyToFile(response, targetPath) {
  if (!response.body) {
    throw new Error("Release asset response did not include a body.");
  }

  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(targetPath);
    output.on("finish", resolve);
    output.on("error", reject);
    Readable.fromWeb(response.body).on("error", reject).pipe(output);
  });
}

async function extractZipArchive(archivePath, destinationPath, execFileImpl = execFileAsync) {
  const command = `Expand-Archive -LiteralPath '${escapePowerShellString(archivePath)}' -DestinationPath '${escapePowerShellString(destinationPath)}' -Force`;
  await execFileImpl("powershell.exe", ["-NoProfile", "-Command", command]);
}

async function fetchGithubReleaseAsset(project, fetchImpl = fetch) {
  const releaseConfig = project.updateFeed;
  if (!releaseConfig?.owner || !releaseConfig?.repo) {
    throw new Error(`Project "${project.id}" is missing GitHub release coordinates.`);
  }

  const response = await fetchImpl(
    `https://api.github.com/repos/${releaseConfig.owner}/${releaseConfig.repo}/releases/latest`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Han-Burger-Desktop"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch latest release for ${releaseConfig.owner}/${releaseConfig.repo}: ${response.status}`);
  }

  const release = await response.json();
  const assetName = releaseConfig.assetName || `${project.id}.zip`;
  const asset = Array.isArray(release.assets)
    ? release.assets.find((item) => item.name === assetName)
    : null;

  if (!asset?.browser_download_url) {
    throw new Error(`Latest release for ${releaseConfig.owner}/${releaseConfig.repo} does not contain asset "${assetName}".`);
  }

  return {
    version: release.tag_name || release.name || project.availableVersion || "0.1.0",
    assetName,
    downloadUrl: asset.browser_download_url
  };
}

async function installProjectFromGithubRelease(project, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const execFileImpl = options.execFileImpl || execFileAsync;
  const tempRoot = options.tempRoot || fs.mkdtempSync(path.join(os.tmpdir(), `han-burger-${project.id}-`));
  const archivePath = path.join(tempRoot, `${project.id}.zip`);
  const releaseAsset = await fetchGithubReleaseAsset(project, fetchImpl);

  const assetResponse = await fetchImpl(releaseAsset.downloadUrl, {
    headers: {
      Accept: "application/octet-stream",
      "User-Agent": "Han-Burger-Desktop"
    }
  });

  if (!assetResponse.ok) {
    throw new Error(`Failed to download ${releaseAsset.assetName}: ${assetResponse.status}`);
  }

  fs.mkdirSync(path.dirname(project.storagePath), { recursive: true });
  fs.rmSync(project.storagePath, { recursive: true, force: true });
  fs.mkdirSync(project.storagePath, { recursive: true });

  try {
    await writeResponseBodyToFile(assetResponse, archivePath);
    await extractZipArchive(archivePath, project.storagePath, execFileImpl);
    if (project.entryFilePath && !fs.existsSync(project.entryFilePath)) {
      throw new Error(`Installed release for "${project.id}" is missing entry file: ${project.entryFilePath}`);
    }
  } finally {
    if (project.entryFilePath && !fs.existsSync(project.entryFilePath)) {
      fs.rmSync(project.storagePath, { recursive: true, force: true });
    }

    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  return {
    installedVersion: releaseAsset.version
  };
}

function ensureProjectDirectories(projects) {
  for (const project of projects) {
    if (!project.installed || !project.storagePath) {
      continue;
    }

    fs.mkdirSync(project.storagePath, { recursive: true });
  }
}

async function installProjectFiles(project, options = {}) {
  if (!project.storagePath) {
    throw new Error(`Project "${project.id}" is missing storagePath.`);
  }

  if (project.updateFeed?.provider === "github") {
    return await installProjectFromGithubRelease(project, options);
  }

  fs.mkdirSync(path.dirname(project.storagePath), { recursive: true });
  fs.rmSync(project.storagePath, { recursive: true, force: true });

  if (project.installSourcePath && fs.existsSync(project.installSourcePath)) {
    fs.cpSync(project.installSourcePath, project.storagePath, { recursive: true });
    if (project.entryFilePath && !fs.existsSync(project.entryFilePath)) {
      fs.rmSync(project.storagePath, { recursive: true, force: true });
      throw new Error(`Installed project "${project.id}" is missing entry file: ${project.entryFilePath}`);
    }

    return {
      installedVersion: project.availableVersion || project.installedVersion || "0.1.0"
    };
  }

  fs.mkdirSync(project.storagePath, { recursive: true });
  if (project.entryFilePath && !fs.existsSync(project.entryFilePath)) {
    fs.rmSync(project.storagePath, { recursive: true, force: true });
    throw new Error(`Installed project "${project.id}" is missing entry file: ${project.entryFilePath}`);
  }

  return {
    installedVersion: project.availableVersion || project.installedVersion || "0.1.0"
  };
}

function uninstallProjectFiles(project) {
  if (!project.storagePath) {
    return;
  }

  fs.rmSync(project.storagePath, { recursive: true, force: true });
}

module.exports = {
  ensureProjectDirectories,
  fetchGithubReleaseAsset,
  installProjectFiles,
  installProjectFromGithubRelease,
  uninstallProjectFiles
};
