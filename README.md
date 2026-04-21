# Han Burger Desktop

這個目錄現在是 Electron 桌面版骨架，對應你要的幾個核心要求：

- 左側固定長條專案選單
- 啟動時右側首頁就是登入畫面
- 登入方式改成 Google OAuth 骨架
- 使用者頭像顯示在左下角
- 開發模式使用專案根目錄的 `app-data`，安裝版使用使用者資料夾內的 `app-data`
- 啟動時一定檢查一次更新，抓到新版本後自動下載並在重啟時套用
- 正式發佈使用 Windows `NSIS` 安裝版

## 專案結構

```text
app-config.example.json  app-data/config/app-config.json 的初始化範本
build/app-data/          其餘初始資料模板，打包時會一起帶進去
src/main/                Electron 主程序、Google OAuth、更新檢查、資料存取
src/renderer/            首頁登入畫面、左側專案列、主視覺
```

## 開發啟動

先安裝依賴：

```powershell
npm install
```

啟動桌面程式：

```powershell
npm run dev
```

## Google 登入設定

實際執行時請修改 [app-config.json](D:\code\han-burger\app-data\config\app-config.json)。

如果 `app-data/config/app-config.json` 還不存在，程式第一次啟動時會從 [app-config.example.json](D:\code\han-burger\app-config.example.json) 自動建立：

```json
{
  "googleOAuth": {
    "clientId": "你的 Google Desktop OAuth Client ID",
    "clientSecret": "如果 Google client 有提供 secret，可填在這裡"
  }
}
```

建議在 Google Cloud Console 建立 Desktop App 類型的 OAuth client，讓桌面程式用 loopback redirect + PKCE 完成登入。

打包時會自動把目前本機的 [app-config.json](D:\code\han-burger\app-data\config\app-config.json) 複製成發佈用 runtime config，讓安裝包第一次啟動時就能沿用你目前測通的 OAuth 設定。

若是 GitHub Actions 發佈，請在 repository secrets 補上：

```text
HAN_BURGER_GOOGLE_CLIENT_ID
HAN_BURGER_GOOGLE_CLIENT_SECRET
```

## 打包

建立 Windows 可執行檔：

```powershell
npm run build
```

直接發佈到 GitHub Releases：

```powershell
npm run release:github
```

輸出位置：

```text
dist/  electron-builder 產物
```

## 更新機制

- 啟動後會自動檢查一次更新
- 若更新來源有新版本，會自動下載
- 下載完成後，下次重開程式時自動套用
- 更新來源固定使用 `package.json` 裡設定的 GitHub Releases
- 目前設定的倉庫是 `hPPPf7/han-burger`

詳細發佈流程可看 [docs/github-releases.md](D:\code\han-burger\docs\github-releases.md)。

## 發佈策略

- 電腦端：提供完整桌面版殼與專案入口
- 手機端：不提供整個桌面版，各專案必須分別下載安裝
