# GitHub Releases Update Flow

這個專案目前使用 `electron-builder` + GitHub Releases 作為桌面版更新來源。
Windows 自動更新會透過 `NSIS` 安裝包進行。

## 一次性設定

1. 建立 GitHub 倉庫：`hPPPf7/han-burger`
2. 把這個資料夾推上 GitHub
3. 確認 GitHub Actions 已啟用
4. 在 GitHub repository secrets 設定：
   - `HAN_BURGER_GOOGLE_CLIENT_ID`
   - `HAN_BURGER_GOOGLE_CLIENT_SECRET`

## 發佈新版

1. 修改 [package.json](D:/code/han-burger/package.json) 的 `version`
2. 提交變更
3. 建立並推送 tag，例如：

```powershell
git tag v0.1.1
git push origin main --tags
```

4. GitHub Actions 會自動：
   - 安裝依賴
   - 建立 Windows NSIS 產物
   - 上傳到 GitHub Release

## 本機手動發佈

若已安裝並登入 GitHub CLI，或已提供 `GH_TOKEN`，也可以本機直接發佈：

```powershell
$env:GH_TOKEN = "你的 GitHub Personal Access Token"
$env:HAN_BURGER_GOOGLE_CLIENT_ID = "你的 Google Client ID"
$env:HAN_BURGER_GOOGLE_CLIENT_SECRET = "你的 Google Client Secret"
npm run release:github
```

## 測試自動更新

1. 先安裝 `0.1.0`
2. 發佈 `0.1.1` 到 GitHub Releases
3. 重新開啟 `0.1.0`
4. 啟動時應看到：
   - 檢查更新中
   - 發現新版本
   - 更新下載中
   - 已下載，重啟後套用

## 注意

- `version` 要和 tag 對應，例如 `0.1.1` 對應 `v0.1.1`
- Windows 未簽章時，使用者可能仍會看到 SmartScreen 警告
