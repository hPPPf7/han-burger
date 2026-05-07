const state = {
  projects: [],
  user: null,
  selectedProjectId: null,
  loadedProjectEntries: {},
  paths: null,
  notes: null,
  theme: "dark",
  isMaximized: false,
  activeView: "login",
  isSigningIn: false,
  crashReports: [],
  selectedCrashReport: null
};

const elements = {
  titlebarVersion: document.getElementById("titlebar-version"),
  themeToggleButton: document.getElementById("theme-toggle-button"),
  minimizeButton: document.getElementById("minimize-button"),
  maximizeButton: document.getElementById("maximize-button"),
  closeButton: document.getElementById("close-button"),
  homeButton: document.getElementById("home-button"),
  userCard: document.getElementById("user-card"),
  projectList: document.getElementById("project-list"),
  googleLoginButton: document.getElementById("google-login-button"),
  checkUpdatesButton: document.getElementById("check-updates-button"),
  restartUpdateButton: document.getElementById("restart-update-button"),
  accountLogoutButton: document.getElementById("account-logout-button"),
  loginView: document.getElementById("login-view"),
  accountView: document.getElementById("account-view"),
  dashboardView: document.getElementById("dashboard-view"),
  projectView: document.getElementById("project-view"),
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
  crashReportSummary: document.getElementById("crash-report-summary"),
  crashReportPreview: document.getElementById("crash-report-preview"),
  refreshCrashReportsButton: document.getElementById("refresh-crash-reports-button"),
  viewCrashReportButton: document.getElementById("view-crash-report-button"),
  exportCrashReportButton: document.getElementById("export-crash-report-button"),
  crashReportNotice: document.getElementById("crash-report-notice"),
  crashReportNoticeMessage: document.getElementById("crash-report-notice-message"),
  crashReportNoticeViewButton: document.getElementById("crash-report-notice-view"),
  crashReportNoticeDismissButton: document.getElementById("crash-report-notice-dismiss"),
  installedProjectsList: document.getElementById("installed-projects-list"),
  projectIntro: document.getElementById("project-intro"),
  projectViewTitle: document.getElementById("project-view-title"),
  projectViewCopy: document.getElementById("project-view-copy"),
  projectViewActionButton: document.getElementById("project-view-action-button"),
  projectViewInstalled: document.getElementById("project-view-installed"),
  projectViewUpdates: document.getElementById("project-view-updates"),
  projectFrame: document.getElementById("project-frame"),
  accountAvatar: document.getElementById("account-avatar"),
  accountName: document.getElementById("account-name"),
  accountEmail: document.getElementById("account-email"),
  accountProvider: document.getElementById("account-provider"),
  accountProfilePath: document.getElementById("account-profile-path"),
  accountUpdatedAt: document.getElementById("account-updated-at")
};

const appShell = document.querySelector(".app-shell");

state.updateStatus = {
  stage: "idle",
  currentVersion: "-",
  latestVersion: "-",
  progressPercent: 0,
  startupFlow: false,
  downloaded: false,
  message: "啟動時會自動檢查一次"
};

function formatVersion(version) {
  if (!version || version === "-") {
    return "-";
  }

  return version.startsWith("v") ? version : `v${version}`;
}

function renderVersionInfo() {
  const currentVersion = state.appVersion || state.updateStatus.currentVersion || "-";
  const latestVersion = state.updateStatus.latestVersion || currentVersion || "-";

  elements.titlebarVersion.textContent = formatVersion(currentVersion);
  elements.loginCurrentVersion.textContent = formatVersion(currentVersion);
  elements.dashboardCurrentVersion.textContent = formatVersion(currentVersion);
  elements.dashboardLatestVersion.textContent = latestVersion === currentVersion ? formatVersion(currentVersion) : formatVersion(latestVersion);
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

  elements.restartUpdateButton.classList.add("hidden");
  elements.restartUpdateButton.textContent = "自動重新啟動中";
  renderUpdateOverlay();
  renderVersionInfo();
}

function renderUpdateOverlay() {
  const progressPercent = Math.max(0, Math.min(100, Math.round(state.updateStatus.progressPercent || 0)));
  const isUpdateActive = ["checking", "available", "downloading", "downloaded", "installing"].includes(state.updateStatus.stage);
  const isInstalling = state.updateStatus.stage === "installing";
  const shouldShow = isUpdateActive;
  const showOverlayProgress = ["downloading", "downloaded", "installing"].includes(state.updateStatus.stage);

  elements.updateOverlay.classList.toggle("hidden", !shouldShow);
  appShell?.classList.toggle("is-update-locked", shouldShow);
  elements.updateOverlayProgress.classList.toggle("hidden", !showOverlayProgress);
  elements.updateOverlayProgressFill.style.width = `${state.updateStatus.downloaded ? 100 : progressPercent}%`;
  elements.updateOverlayProgressLabel.textContent = state.updateStatus.downloaded ? "100%" : `${progressPercent}%`;

  if (state.updateStatus.stage === "checking") {
    elements.updateOverlayTitle.textContent = "正在檢查更新";
    elements.updateOverlayMessage.textContent = "請稍候，正在確認目前是否有可用的新版本。";
    return;
  }

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
  elements.projectView.classList.toggle("hidden", viewName !== "project");
  document.querySelector(".content")?.classList.toggle("project-mode", viewName === "project");
  elements.homeButton.classList.toggle("is-active", viewName === "dashboard" || viewName === "login");
  renderProjectList();
}

function showLoginView() {
  setActiveView("login");
}

function showDashboardView() {
  setActiveView("dashboard");
}

function uploadCalendarBeforeLeaving() {
  return Promise.resolve();
}

function projectNavName(project) {
  return project.name?.replace(/^Han Burger\s+/i, "") || "Project";
}

function postProjectTheme() {
  const targetWindow = elements.projectFrame.contentWindow;
  if (!targetWindow) {
    return;
  }

  targetWindow.postMessage({
    source: "han-burger-desktop",
    type: "theme",
    theme: state.theme
  }, "*");
}

async function showProjectView(project) {
  if (project.id !== state.selectedProjectId) {
    await uploadCalendarBeforeLeaving();
  }

  elements.projectViewTitle.textContent = project.name;
  elements.projectViewCopy.textContent = project.description || "目前正在查看專案首頁。";
  elements.projectViewInstalled.textContent = project.installed
    ? `已安裝${project.installedVersion ? ` · ${formatVersion(project.installedVersion)}` : ""}`
    : "尚未安裝";
  elements.projectViewUpdates.textContent = project.installed
    ? "之後只會檢查已安裝專案的更新"
    : "未安裝時會略過更新檢查";
  elements.projectViewActionButton.textContent = project.installed ? "進入專案" : "安裝專案";
  elements.projectViewActionButton.className = project.installed ? "primary-button" : "ghost-button";
  elements.projectIntro.classList.toggle("hidden", project.installed);
  elements.projectFrame.classList.toggle("hidden", !project.installed);

  if (!project.installed) {
    elements.projectFrame.removeAttribute("src");
    elements.projectFrame.srcdoc = "";
    setActiveView("project");
    return;
  }

  let entry = state.loadedProjectEntries[project.id];
  if (!entry) {
    entry = await window.hanBurger.getProjectEntry(project.id);
    state.loadedProjectEntries[project.id] = entry;
  }

  if (entry?.kind === "file" && entry.fileUrl) {
    elements.projectFrame.removeAttribute("srcdoc");
    elements.projectFrame.src = entry.fileUrl;
  } else {
    elements.projectFrame.removeAttribute("src");
    elements.projectFrame.srcdoc = `
      <!doctype html>
      <html lang="zh-Hant">
        <head>
          <meta charset="UTF-8" />
          <style>
            body {
              margin: 0;
              display: grid;
              place-items: center;
              min-height: 100vh;
              font-family: "Segoe UI", "Microsoft JhengHei UI", sans-serif;
              background: #120f0d;
              color: #f6efe5;
            }
            .empty-state {
              width: min(480px, calc(100% - 48px));
              padding: 28px;
              border-radius: 24px;
              background: rgba(255,255,255,0.04);
              border: 1px solid rgba(255,255,255,0.08);
            }
            h1 { margin: 0 0 12px; font-size: 24px; }
            p { margin: 0; line-height: 1.7; color: #bca998; }
          </style>
        </head>
        <body>
          <div class="empty-state">
            <h1>${project.name}</h1>
            <p>目前尚未準備好首頁檔案，請確認專案入口頁已建立。</p>
          </div>
        </body>
      </html>
    `;
  }

  setActiveView("project");
}

function showHomeView() {
  if (state.user) {
    showDashboardView();
    return;
  }

  showLoginView();
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
  postProjectTheme();
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
    const isSelected = state.activeView === "project" && project.id === state.selectedProjectId;
    button.className = `project-item${isSelected ? " is-selected" : ""}`;
    button.innerHTML = `<strong>${projectNavName(project)}</strong>`;
    button.addEventListener("click", async () => {
      if (state.selectedProjectId !== project.id) {
        await uploadCalendarBeforeLeaving();
      }
      state.selectedProjectId = project.id;
      renderProjectList();
      renderSelectedProject();
      await showProjectView(project);
    });
    elements.projectList.appendChild(button);
  });
}

function renderSelectedProject() {
  return getSelectedProject();
}

function renderInstalledProjects() {
  const installedProjects = state.projects.filter((project) => project.installed);
  elements.installedProjectsList.innerHTML = "";

  if (installedProjects.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "installed-project-empty";
    emptyState.textContent = "目前沒有已安裝專案。";
    elements.installedProjectsList.appendChild(emptyState);
    return;
  }

  installedProjects.forEach((project) => {
    const item = document.createElement("div");
    item.className = "installed-project-item";
    item.innerHTML = `
      <div>
        <strong>${project.name}</strong>
        <span>${project.installedVersion ? `目前版本 ${formatVersion(project.installedVersion)}` : "已安裝"}</span>
      </div>
    `;

    const deleteButton = document.createElement("button");
    deleteButton.className = "danger-button";
    deleteButton.textContent = "刪除專案";
    deleteButton.addEventListener("click", async () => {
      const payload = await window.hanBurger.removeProject(project.id);
      if (state.selectedProjectId === project.id) {
        state.selectedProjectId = null;
        showDashboardView();
      }
      applyBootstrap(payload);
    });

    item.appendChild(deleteButton);
    elements.installedProjectsList.appendChild(item);
  });
}

async function refreshCrashReports() {
  try {
    const reports = await window.hanBurger.listCrashReports();
    state.crashReports = reports || [];
    state.selectedCrashReport = state.crashReports[0] || null;
    renderCrashReports();
  } catch (error) {
    elements.crashReportSummary.textContent = `讀取錯誤報告失敗: ${error.message}`;
  }
}

function renderCrashReports() {
  if (!state.crashReports.length) {
    elements.crashReportSummary.textContent = "目前沒有錯誤報告。";
    elements.crashReportPreview.classList.add("hidden");
    elements.crashReportPreview.textContent = "";
    elements.viewCrashReportButton.disabled = true;
    elements.exportCrashReportButton.disabled = true;
    return;
  }

  const latest = state.crashReports[0];
  elements.crashReportSummary.textContent = `最近報告：${latest.name} · ${new Date(latest.updatedAt).toLocaleString()}`;
  elements.viewCrashReportButton.disabled = false;
  elements.exportCrashReportButton.disabled = false;
}

async function showLatestCrashReport() {
  const report = state.selectedCrashReport || state.crashReports[0];
  if (!report) return;

  try {
    const content = await window.hanBurger.readCrashReport(report.path);
    elements.crashReportPreview.textContent = content;
    elements.crashReportPreview.classList.remove("hidden");
  } catch (error) {
    elements.crashReportSummary.textContent = `查看報告失敗: ${error.message}`;
  }
}

async function showCrashReportNotice(payload = {}) {
  try {
    await refreshCrashReports();
    const createdAt = payload.createdAt ? new Date(payload.createdAt).toLocaleString() : "剛剛";
    const kind = payload.kind ? `（${payload.kind}）` : "";
    elements.crashReportNoticeMessage.textContent = `${createdAt} 已建立新的錯誤報告${kind}。`;
    elements.crashReportNotice.classList.remove("hidden");
  } catch {
    // Notification UI should never create another report loop.
  }
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
    elements.avatar.style.backgroundImage = `url("${state.user.avatarUrl}")`;
    elements.avatar.style.color = "transparent";
    elements.accountAvatar.style.backgroundImage = `url("${state.user.avatarUrl}")`;
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
  renderInstalledProjects();
  refreshCrashReports().catch(() => undefined);
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

elements.projectViewActionButton.addEventListener("click", async () => {
  const project = getSelectedProject();
  if (!project) {
    return;
  }

  if (project.installed && project.entryFilePath) {
    await showProjectView(project);
    return;
  }

  elements.projectViewActionButton.disabled = true;
  elements.projectViewActionButton.textContent = "安裝中...";
  let installSucceeded = false;

  try {
    const payload = await window.hanBurger.installProject(project.id);
    state.loadedProjectEntries[project.id] = null;
    applyBootstrap(payload);
    const nextProject = payload.projects.find((item) => item.id === project.id);
    if (nextProject) {
      await showProjectView(nextProject);
    }
    installSucceeded = true;
  } catch (error) {
    elements.updateStatus.textContent = `安裝失敗: ${error.message}`;
  } finally {
    elements.projectViewActionButton.disabled = false;
    if (!installSucceeded) {
      elements.projectViewActionButton.textContent = project.installed ? "進入專案" : "安裝專案";
    }
  }
});

window.addEventListener("message", async (event) => {
  if (event.source !== elements.projectFrame.contentWindow) {
    return;
  }

  const sourceWindow = event.source;
  if (!sourceWindow) {
    return;
  }

  const message = event.data || {};
  if (message.source !== "han-burger-calendar" || !message.requestId) {
    return;
  }

  function reply(payload) {
    try {
      sourceWindow.postMessage(payload, "*");
    } catch (error) {
      window.hanBurger.recordRendererError({
        message: "Failed to reply to calendar iframe",
        detail: error.message
      });
    }
  }

  try {
    let payload;
    if (message.type === "calendar:getEvents") {
      payload = await window.hanBurger.getCalendarEvents();
    } else if (message.type === "calendar:saveEvents") {
      payload = await window.hanBurger.saveCalendarEvents(message.events || []);
    } else if (message.type === "calendar:downloadEvents") {
      payload = await window.hanBurger.downloadCalendarEvents();
    } else if (message.type === "calendar:uploadEvents") {
      payload = await window.hanBurger.uploadCalendarEvents(message.events || []);
    } else if (message.type === "calendar:openWidget") {
      payload = await window.hanBurger.openCalendarWidget(state.theme);
    } else if (message.type === "calendar:closeWidget") {
      payload = await window.hanBurger.closeCalendarWidget();
    } else if (message.type === "calendar:moveWidget") {
      payload = await window.hanBurger.moveCalendarWidget(message.deltaX, message.deltaY);
    } else if (message.type === "calendar:setWidgetOpacity") {
      payload = await window.hanBurger.setCalendarWidgetOpacity(message.opacity);
    } else {
      throw new Error(`Unsupported calendar message: ${message.type}`);
    }

    reply({
      source: "han-burger-desktop",
      requestId: message.requestId,
      ok: true,
      payload
    });
  } catch (error) {
    reply({
      source: "han-burger-desktop",
      requestId: message.requestId,
      ok: false,
      error: error.message
    });
  }
});

elements.checkUpdatesButton.addEventListener("click", async () => {
  await window.hanBurger.triggerUpdateCheck();
});

elements.refreshCrashReportsButton.addEventListener("click", async () => {
  await refreshCrashReports();
});

elements.viewCrashReportButton.addEventListener("click", async () => {
  await showLatestCrashReport();
});

elements.exportCrashReportButton.addEventListener("click", async () => {
  const report = state.selectedCrashReport || state.crashReports[0];
  if (!report) return;

  try {
    const targetPath = await window.hanBurger.exportCrashReport(report.path);
    elements.crashReportSummary.textContent = `已下載報告到 ${targetPath}`;
  } catch (error) {
    elements.crashReportSummary.textContent = `下載報告失敗: ${error.message}`;
  }
});

elements.crashReportNoticeDismissButton.addEventListener("click", () => {
  elements.crashReportNotice.classList.add("hidden");
});

elements.crashReportNoticeViewButton.addEventListener("click", async () => {
  elements.crashReportNotice.classList.add("hidden");
  showDashboardView();
  await refreshCrashReports();
  await showLatestCrashReport();
});

elements.homeButton.addEventListener("click", () => {
  showHomeView();
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

elements.projectFrame.addEventListener("load", () => {
  postProjectTheme();
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

window.hanBurger.onProjectsChanged((payload) => {
  state.loadedProjectEntries = {};
  applyBootstrap(payload);
});

window.hanBurger.onProjectUpdateStatus((payload) => {
  if (payload?.message) {
    elements.updateStatus.textContent = payload.message;
  }
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

window.hanBurger.onCrashReportCreated((payload) => {
  showCrashReportNotice(payload).catch(() => undefined);
});

window.hanBurger.onClosingSyncStatus((payload) => {
  const isActive = ["uploading", "done", "error"].includes(payload?.stage);
  elements.updateOverlay.classList.toggle("hidden", !isActive);
  appShell?.classList.toggle("is-update-locked", isActive);
  elements.updateOverlayProgress.classList.add("hidden");
  elements.updateOverlayTitle.textContent = payload?.stage === "uploading" ? "正在上傳 Calendar" : "正在關閉";
  elements.updateOverlayMessage.textContent = payload?.message || "正在處理 Calendar 同步資料。";
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

window.addEventListener("error", (event) => {
  window.hanBurger.recordRendererError({
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    stack: event.error?.stack || null
  }).catch(() => undefined);
});

window.addEventListener("unhandledrejection", (event) => {
  window.hanBurger.recordRendererError({
    message: "Unhandled renderer promise rejection",
    reason: event.reason?.message || String(event.reason),
    stack: event.reason?.stack || null
  }).catch(() => undefined);
});
