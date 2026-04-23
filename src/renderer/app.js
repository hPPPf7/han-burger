const state = {
  projects: [],
  user: null,
  selectedProjectId: null,
  paths: null,
  notes: null,
  theme: "dark",
  isMaximized: false,
  activeView: "login",
  isSigningIn: false
};

const elements = {
  titlebarVersion: document.getElementById("titlebar-version"),
  themeToggleButton: document.getElementById("theme-toggle-button"),
  minimizeButton: document.getElementById("minimize-button"),
  maximizeButton: document.getElementById("maximize-button"),
  closeButton: document.getElementById("close-button"),
  userCard: document.getElementById("user-card"),
  projectList: document.getElementById("project-list"),
  removeProjectButton: document.getElementById("remove-project-button"),
  googleLoginButton: document.getElementById("google-login-button"),
  checkUpdatesButton: document.getElementById("check-updates-button"),
  restartUpdateButton: document.getElementById("restart-update-button"),
  accountLogoutButton: document.getElementById("account-logout-button"),
  loginView: document.getElementById("login-view"),
  accountView: document.getElementById("account-view"),
  dashboardView: document.getElementById("dashboard-view"),
  updateOverlay: document.getElementById("update-overlay"),
  updateOverlayTitle: document.getElementById("update-overlay-title"),
  updateOverlayMessage: document.getElementById("update-overlay-message"),
  updateOverlayProgress: document.getElementById("update-overlay-progress"),
  updateOverlayProgressFill: document.getElementById("update-overlay-progress-fill"),
  updateOverlayProgressLabel: document.getElementById("update-overlay-progress-label"),
  userName: document.getElementById("user-name"),
  userEmail: document.getElementById("user-email"),
  avatar: document.getElementById("avatar"),
  welcomeCopy: document.getElementById("welcome-copy"),
  dataRoot: document.getElementById("data-root"),
  updateStatus: document.getElementById("update-status"),
  desktopNote: document.getElementById("desktop-note"),
  mobileNote: document.getElementById("mobile-note"),
  loginCurrentVersion: document.getElementById("login-current-version"),
  googleConfigStatus: document.getElementById("google-config-status"),
  updateConfigStatus: document.getElementById("update-config-status"),
  dashboardTitle: document.getElementById("dashboard-title"),
  dashboardUser: document.getElementById("dashboard-user"),
  dashboardCurrentVersion: document.getElementById("dashboard-current-version"),
  dashboardLatestVersion: document.getElementById("dashboard-latest-version"),
  dashboardProjectCount: document.getElementById("dashboard-project-count"),
  dashboardDataRoot: document.getElementById("dashboard-data-root"),
  updateDetail: document.getElementById("update-detail"),
  updateProgress: document.getElementById("update-progress"),
  updateProgressFill: document.getElementById("update-progress-fill"),
  updateProgressLabel: document.getElementById("update-progress-label"),
  selectedProjectName: document.getElementById("selected-project-name"),
  selectedProjectDescription: document.getElementById("selected-project-description"),
  selectedProjectPath: document.getElementById("selected-project-path"),
  selectedProjectDesktop: document.getElementById("selected-project-desktop"),
  selectedProjectMobile: document.getElementById("selected-project-mobile"),
  accountAvatar: document.getElementById("account-avatar"),
  accountName: document.getElementById("account-name"),
  accountEmail: document.getElementById("account-email"),
  accountProvider: document.getElementById("account-provider"),
  accountProfilePath: document.getElementById("account-profile-path"),
  accountUpdatedAt: document.getElementById("account-updated-at")
};

state.updateStatus = {
  stage: "idle",
  currentVersion: "-",
  latestVersion: "-",
  progressPercent: 0,
  startupFlow: false,
  downloaded: false,
  message: "啟動時會自動檢查一次"
};

function renderVersionInfo() {
  const currentVersion = state.appVersion || state.updateStatus.currentVersion || "-";
  const latestVersion = state.updateStatus.latestVersion || currentVersion || "-";

  elements.titlebarVersion.textContent = `v${currentVersion}`;
  elements.loginCurrentVersion.textContent = `v${currentVersion}`;
  elements.dashboardCurrentVersion.textContent = `v${currentVersion}`;
  elements.dashboardLatestVersion.textContent = latestVersion === currentVersion ? `v${currentVersion}` : `v${latestVersion}`;
}

function renderUpdateStatus() {
  const progressPercent = Math.max(0, Math.min(100, Math.round(state.updateStatus.progressPercent || 0)));
  const showProgress = state.updateStatus.stage === "downloading" || state.updateStatus.stage === "downloaded" || state.updateStatus.stage === "installing";

  elements.updateStatus.textContent = state.updateStatus.message;
  elements.updateDetail.textContent = state.updateStatus.downloaded
    ? `目前版本 v${state.updateStatus.currentVersion}，新版本 v${state.updateStatus.latestVersion} 已下載完成，系統將自動重新啟動套用更新。`
    : state.updateStatus.latestVersion && state.updateStatus.latestVersion !== state.updateStatus.currentVersion
      ? `目前版本 v${state.updateStatus.currentVersion}，系統正在處理新版本 v${state.updateStatus.latestVersion}${state.updateStatus.stage === "downloading" ? `，目前已下載 ${progressPercent}%` : ""}。`
      : `目前版本 v${state.updateStatus.currentVersion}。啟動時會自動檢查新版本。`;
  elements.updateProgress.classList.toggle("hidden", !showProgress);
  elements.updateProgressFill.style.width = `${state.updateStatus.downloaded ? 100 : progressPercent}%`;
  elements.updateProgressLabel.textContent = state.updateStatus.downloaded ? "100%" : `${progressPercent}%`;

  elements.restartUpdateButton.classList.toggle("hidden", !state.updateStatus.downloaded);
  elements.restartUpdateButton.textContent = "立即重新啟動";
  renderUpdateOverlay();
  renderVersionInfo();
}

function renderUpdateOverlay() {
  const progressPercent = Math.max(0, Math.min(100, Math.round(state.updateStatus.progressPercent || 0)));
  const isStartupChecking = Boolean(state.updateStatus.startupFlow) &&
    ["checking", "available", "downloading", "downloaded"].includes(state.updateStatus.stage);
  const isInstalling = state.updateStatus.stage === "installing";
  const shouldShow = isStartupChecking || isInstalling;
  const showOverlayProgress = ["downloading", "downloaded", "installing"].includes(state.updateStatus.stage);

  elements.updateOverlay.classList.toggle("hidden", !shouldShow);
  elements.updateOverlayProgress.classList.toggle("hidden", !showOverlayProgress);
  elements.updateOverlayProgressFill.style.width = `${state.updateStatus.downloaded ? 100 : progressPercent}%`;
  elements.updateOverlayProgressLabel.textContent = state.updateStatus.downloaded ? "100%" : `${progressPercent}%`;

  if (isStartupChecking) {
    if (state.updateStatus.stage === "available" || state.updateStatus.stage === "downloading") {
      elements.updateOverlayTitle.textContent = "正在下載更新";
      elements.updateOverlayMessage.textContent = `正在下載新版本 ${state.updateStatus.latestVersion || ""}，目前進度 ${progressPercent}%。`;
      return;
    }

    if (state.updateStatus.stage === "downloaded") {
      elements.updateOverlayTitle.textContent = "更新已下載完成";
      elements.updateOverlayMessage.textContent = `新版本 ${state.updateStatus.latestVersion || ""} 已下載完成，系統即將自動重新啟動套用。`;
      return;
    }

    elements.updateOverlayTitle.textContent = "正在檢查更新";
    elements.updateOverlayMessage.textContent = "請稍候，正在確認目前是否有可用的新版本。";
    return;
  }

  if (isInstalling) {
    elements.updateOverlayTitle.textContent = "正在套用更新";
    elements.updateOverlayMessage.textContent = state.updateStatus.message || "請稍候，桌面版將自動重新啟動。";
  }
}

function setActiveView(viewName) {
  state.activeView = viewName;
  elements.loginView.classList.toggle("hidden", viewName !== "login");
  elements.accountView.classList.toggle("hidden", viewName !== "account");
  elements.dashboardView.classList.toggle("hidden", viewName !== "dashboard");
}

function showLoginView() {
  setActiveView("login");
}

function showDashboardView() {
  setActiveView("dashboard");
}

function showAccountView() {
  if (!state.user) {
    showLoginView();
    return;
  }

  setActiveView("account");
}

function setTheme(theme) {
  state.theme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = state.theme;
  elements.themeToggleButton.textContent = state.theme === "dark" ? "Dark" : "Light";
  localStorage.setItem("han-burger-theme", state.theme);
}

function toggleTheme() {
  setTheme(state.theme === "dark" ? "light" : "dark");
}

function applyWindowState() {
  elements.maximizeButton.textContent = state.isMaximized ? "❐" : "口";
  elements.maximizeButton.title = state.isMaximized ? "還原" : "全螢幕";
}

function getSelectedProject() {
  return state.projects.find((project) => project.id === state.selectedProjectId) || null;
}

function renderProjectList() {
  elements.projectList.innerHTML = "";

  state.projects.forEach((project) => {
    const button = document.createElement("button");
    button.className = `project-item${project.id === state.selectedProjectId ? " is-selected" : ""}`;
    button.innerHTML = `<strong>${project.name}</strong><span>${project.description}</span>`;
    button.addEventListener("click", () => {
      state.selectedProjectId = project.id;
      renderProjectList();
      renderSelectedProject();
    });
    elements.projectList.appendChild(button);
  });
}

function renderSelectedProject() {
  const project = getSelectedProject();

  if (!project) {
    elements.selectedProjectName.textContent = "尚未選取專案";
    elements.selectedProjectDescription.textContent = "左側選取一個專案後，這裡可以放更新、快取、入口與版本資訊。";
    elements.selectedProjectPath.textContent = "-";
    elements.selectedProjectDesktop.textContent = "-";
    elements.selectedProjectMobile.textContent = "-";
    return;
  }

  elements.selectedProjectName.textContent = project.name;
  elements.selectedProjectDescription.textContent = project.description;
  elements.selectedProjectPath.textContent = project.storagePath;
  elements.selectedProjectDesktop.textContent = project.desktopEnabled ? "由桌面版統一承載" : "未提供";
  elements.selectedProjectMobile.textContent = project.mobileDistributedSeparately ? "需單獨下載安裝" : "與桌面共用";
}

function renderUser() {
  if (!state.user) {
    elements.userCard.classList.add("is-logged-out");
    elements.userCard.classList.remove("is-logged-in");
    elements.userName.textContent = "尚未登入";
    elements.userEmail.textContent = "請先使用 Google 登入";
    elements.avatar.textContent = "?";
    elements.avatar.style.backgroundImage = "";
    elements.accountAvatar.textContent = "?";
    elements.accountAvatar.style.backgroundImage = "";
    elements.accountName.textContent = "尚未登入";
    elements.accountEmail.textContent = "請先使用 Google 登入。";
    elements.accountProfilePath.textContent = "-";
    elements.accountUpdatedAt.textContent = "-";
    elements.welcomeCopy.textContent = "啟動後右側首頁就是登入視窗。桌面版使用 Google 登入，登入後才顯示使用者資訊與專案操作。";
    showLoginView();
    return;
  }

  elements.userCard.classList.add("is-logged-in");
  elements.userCard.classList.remove("is-logged-out");
  elements.userName.textContent = state.user.name;
  elements.userEmail.textContent = state.user.email;
  elements.avatar.textContent = state.user.name?.slice(0, 1)?.toUpperCase() || "G";
  if (state.user.avatarUrl) {
    elements.avatar.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.15), rgba(0,0,0,0.15)), url("${state.user.avatarUrl}")`;
    elements.avatar.style.color = "transparent";
    elements.accountAvatar.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.15), rgba(0,0,0,0.15)), url("${state.user.avatarUrl}")`;
    elements.accountAvatar.style.color = "transparent";
  } else {
    elements.avatar.style.backgroundImage = "";
    elements.avatar.style.color = "";
    elements.accountAvatar.style.backgroundImage = "";
    elements.accountAvatar.style.color = "";
  }

  elements.accountAvatar.textContent = state.user.name?.slice(0, 1)?.toUpperCase() || "G";
  elements.accountName.textContent = state.user.name;
  elements.accountEmail.textContent = state.user.email;
  elements.accountProvider.textContent = "Google OAuth";
  elements.accountProfilePath.textContent = state.user.profilePath || "-";
  elements.accountUpdatedAt.textContent = state.user.updatedAt || "-";
  elements.welcomeCopy.textContent = `歡迎回來，${state.user.name}。啟動時已執行更新檢查，現在可從左側切換桌面專案。`;
  elements.dashboardUser.textContent = `${state.user.name} (${state.user.email})`;

  if (state.activeView === "login") {
    showDashboardView();
  } else {
    setActiveView(state.activeView);
  }
}

function renderMeta(config) {
  renderVersionInfo();
  renderUpdateStatus();
  elements.dataRoot.textContent = state.paths.dataRoot;
  elements.dashboardDataRoot.textContent = state.paths.dataRoot;
  elements.desktopNote.textContent = state.notes.desktopDistribution;
  elements.mobileNote.textContent = state.notes.mobileDistribution;
  elements.googleConfigStatus.textContent = config.googleConfigured ? "已設定 clientId" : "尚未設定 clientId";
  elements.updateConfigStatus.textContent = config.updateFeedConfigured ? "已設定更新來源" : "尚未設定更新來源";
  elements.dashboardProjectCount.textContent = `${state.projects.length} 個`;
}

function renderAll(config) {
  if (!state.selectedProjectId && state.projects.length) {
    state.selectedProjectId = state.projects[0].id;
  }

  renderProjectList();
  renderSelectedProject();
  renderUser();
  renderMeta(config);
}

function applyBootstrap(payload) {
  state.appVersion = payload.appVersion || state.appVersion || "-";
  state.projects = payload.projects;
  state.user = payload.user;
  state.paths = payload.paths;
  state.notes = payload.notes;
  if (!state.projects.some((project) => project.id === state.selectedProjectId)) {
    state.selectedProjectId = state.projects[0]?.id || null;
  }

  if (!state.user) {
    state.activeView = "login";
  } else if (state.activeView === "login") {
    state.activeView = "dashboard";
  }

  renderAll(payload.config);
}

async function startGoogleLogin() {
  if (state.isSigningIn) {
    return;
  }

  state.isSigningIn = true;
  elements.googleLoginButton.disabled = true;
  elements.googleLoginButton.textContent = "等待 Google 登入...";
  elements.updateStatus.textContent = "正在開啟 Google 登入...";

  try {
    const payload = await window.hanBurger.signInWithGoogle();
    applyBootstrap(payload);
  } catch (error) {
    elements.updateStatus.textContent = `登入失敗: ${error.message}`;
  } finally {
    state.isSigningIn = false;
    elements.googleLoginButton.disabled = false;
    elements.googleLoginButton.textContent = "使用 Google 登入";
  }
}

elements.googleLoginButton.addEventListener("click", async () => {
  await startGoogleLogin();
});

elements.removeProjectButton.addEventListener("click", async () => {
  if (!state.selectedProjectId) {
    return;
  }

  const payload = await window.hanBurger.removeProject(state.selectedProjectId);
  applyBootstrap(payload);
});

elements.checkUpdatesButton.addEventListener("click", async () => {
  await window.hanBurger.triggerUpdateCheck();
});

elements.restartUpdateButton.addEventListener("click", async () => {
  elements.restartUpdateButton.disabled = true;
  elements.restartUpdateButton.textContent = "正在重新啟動...";
  const didRestart = await window.hanBurger.restartAndInstallUpdate();

  if (!didRestart) {
    elements.restartUpdateButton.disabled = false;
    elements.restartUpdateButton.textContent = "重新啟動並更新";
    elements.updateStatus.textContent = "目前還沒有可套用的更新。";
  }
});

elements.userCard.addEventListener("click", () => {
  if (state.user) {
    showAccountView();
    return;
  }

  void startGoogleLogin();
});

elements.accountLogoutButton.addEventListener("click", async () => {
  const payload = await window.hanBurger.signOut();
  applyBootstrap(payload);
});

elements.themeToggleButton.addEventListener("click", () => {
  toggleTheme();
});

elements.minimizeButton.addEventListener("click", async () => {
  await window.hanBurger.minimizeWindow();
});

elements.maximizeButton.addEventListener("click", async () => {
  await window.hanBurger.maximizeWindow();
});

elements.closeButton.addEventListener("click", async () => {
  await window.hanBurger.closeWindow();
});

window.hanBurger.onAuthChanged((payload) => {
  applyBootstrap(payload);
});

window.hanBurger.onUpdateStatus((payload) => {
  state.updateStatus = {
    ...state.updateStatus,
    ...payload,
    currentVersion: payload.currentVersion || state.appVersion || state.updateStatus.currentVersion || "-",
    latestVersion: payload.latestVersion || state.updateStatus.latestVersion || payload.currentVersion || state.appVersion || "-",
    progressPercent: payload.progressPercent ?? state.updateStatus.progressPercent ?? 0,
    startupFlow: payload.startupFlow ?? false,
    downloaded: Boolean(payload.downloaded)
  };

  renderUpdateStatus();
});

window.hanBurger.onWindowStateChanged((payload) => {
  state.isMaximized = Boolean(payload.isMaximized);
  applyWindowState();
});

window.hanBurger
  .getBootstrapData()
  .then((payload) => {
    setTheme(localStorage.getItem("han-burger-theme") || "dark");
    applyBootstrap(payload);
    applyWindowState();
  })
  .catch((error) => {
    elements.updateStatus.textContent = `初始化失敗: ${error.message}`;
  });
