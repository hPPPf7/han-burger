const elements = {
  parentFolder: document.getElementById("parent-folder"),
  projectFolder: document.getElementById("project-folder"),
  projectBrowseButton: document.getElementById("project-browse-button"),
  startButton: document.getElementById("start-button"),
  backButton: document.getElementById("back-button"),
  progressFill: document.getElementById("progress-fill"),
  progressLabel: document.getElementById("progress-label"),
  progressTitle: document.getElementById("progress-title"),
  progressCopy: document.getElementById("progress-copy"),
  autoOpenCheckbox: document.getElementById("auto-open-checkbox"),
  introCopy: document.getElementById("intro-copy"),
  folderSection: document.getElementById("folder-section"),
  confirmSection: document.getElementById("confirm-section"),
  confirmProjectFolder: document.getElementById("confirm-project-folder"),
  noteSection: document.getElementById("note-section"),
  progressSection: document.getElementById("progress-section"),
  stepItems: Array.from(document.querySelectorAll(".step-item")),
  minimizeButton: document.getElementById("minimize-button"),
  closeButton: document.getElementById("close-button")
};

let currentStep = 1;
let progressTimer = null;
const dataFolderName = "HanBurger";

function joinPath(parentPath, childName) {
  const trimmedParent = parentPath.trim().replace(/[\\/]+$/, "");
  if (!trimmedParent) {
    return childName;
  }

  return `${trimmedParent}\\${childName}`;
}

function getDataFolderPath() {
  return joinPath(elements.parentFolder.value, dataFolderName);
}

function syncResolvedPath() {
  elements.projectFolder.textContent = getDataFolderPath();
}

function setActiveStep(step) {
  currentStep = step;
  elements.stepItems.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.step === String(step));
  });

  elements.folderSection.classList.toggle("hidden", step !== 1);
  elements.noteSection.classList.toggle("hidden", step !== 1);
  elements.confirmSection.classList.toggle("hidden", step !== 2);
  elements.progressSection.classList.toggle("hidden", step !== 3);
  elements.backButton.classList.toggle("hidden", step === 3);
  elements.backButton.disabled = step === 1;

  if (step === 1) {
    elements.startButton.disabled = false;
    elements.startButton.textContent = "下一步";
    elements.introCopy.textContent = "先選擇要放置 Han Burger 資料夾的位置。導引程式會自動建立 HanBurger 子資料夾，後續更新仍由 Desktop 自動完成。";
    return;
  }

  if (step === 2) {
    elements.startButton.disabled = false;
    elements.startButton.textContent = "下載並安裝";
    elements.confirmProjectFolder.textContent = getDataFolderPath();
    elements.introCopy.textContent = "確認資料位置後，就可以下載並啟動正式 Han Burger Desktop 安裝器。";
    return;
  }

  elements.startButton.disabled = true;
  elements.startButton.textContent = "處理中...";
  elements.introCopy.textContent = "正在處理安裝導引。正式版本會在完成後啟動 NSIS 安裝器。";
}

function setProgress(percent, title, copy) {
  const value = Math.max(0, Math.min(100, percent));
  elements.progressFill.style.width = `${value}%`;
  elements.progressLabel.textContent = `${value}%`;
  elements.progressTitle.textContent = title;
  elements.progressCopy.textContent = copy;
}

async function selectProjectFolder() {
  if (!window.hanBurgerInstaller?.selectFolder) {
    return;
  }

  const folder = await window.hanBurgerInstaller.selectFolder("選擇 Han Burger 資料位置");
  if (folder) {
    elements.parentFolder.value = folder;
    syncResolvedPath();
  }
}

function resetInstallProgress() {
  window.clearInterval(progressTimer);
  progressTimer = null;
  setProgress(0, "準備開始", "正在準備下載正式安裝器。");
}

function startPreviewInstall() {
  if (progressTimer) {
    return;
  }

  setActiveStep(3);
  setProgress(8, "正在準備", "正在確認資料夾設定，接著會下載正式 NSIS 安裝包。");
  progressTimer = true;

  window.hanBurgerInstaller.installDesktop({
    dataRoot: getDataFolderPath(),
    autoOpen: elements.autoOpenCheckbox.checked
  }).then(() => {
    elements.startButton.disabled = false;
    elements.startButton.textContent = "關閉";
    elements.startButton.dataset.action = "close";
  }).catch((error) => {
    elements.startButton.disabled = false;
    elements.startButton.textContent = "重試";
    elements.startButton.dataset.action = "retry";
    setProgress(0, "安裝失敗", error.message || "安裝流程發生錯誤。");
  }).finally(() => {
    progressTimer = null;
  });
}

elements.projectBrowseButton.addEventListener("click", () => {
  void selectProjectFolder();
});

window.hanBurgerInstaller?.onInstallProgress?.((payload) => {
  setProgress(payload.percent || 0, payload.title || "正在安裝", payload.copy || "");
});

elements.parentFolder.addEventListener("input", () => {
  syncResolvedPath();
});

elements.startButton.addEventListener("click", () => {
  if (elements.startButton.dataset.action === "close") {
    window.hanBurgerInstaller?.close?.();
    return;
  }

  if (currentStep === 1) {
    resetInstallProgress();
    setActiveStep(2);
    return;
  }

  if (currentStep === 2 || currentStep === 3) {
    elements.startButton.dataset.action = "install";
    resetInstallProgress();
    startPreviewInstall();
  }
});

elements.backButton.addEventListener("click", () => {
  if (currentStep === 2) {
    setActiveStep(1);
  }
});

elements.minimizeButton.addEventListener("click", () => {
  window.hanBurgerInstaller?.minimize?.();
});

elements.closeButton.addEventListener("click", () => {
  window.hanBurgerInstaller?.close?.();
});

setActiveStep(1);
syncResolvedPath();
