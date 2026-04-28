!include nsDialogs.nsh
!include LogicLib.nsh

!ifndef BUILD_UNINSTALLER

Var ProjectDataDir
Var ProjectDataDirInput

!macro customWelcomePage
  Page custom WelcomePageCreate WelcomePageLeave
!macroend

!macro customPageAfterChangeDir
  Page custom ProjectDataDirPageCreate ProjectDataDirPageLeave
!macroend

Function WelcomePageCreate
  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 12u "HAN BURGER"
  Pop $0
  SetCtlColors $0 0x4BA8E1 transparent

  ${NSD_CreateLabel} 0 18u 100% 26u "安裝 Han Burger Desktop"
  Pop $0
  CreateFont $1 "Segoe UI" 16 700
  SendMessage $0 ${WM_SETFONT} $1 1

  ${NSD_CreateLabel} 0 50u 100% 24u "桌面端集中管理 Watch 與其他 Han Burger 專案。本機資料會留在你選擇的專案資料夾，更新時只替換程式本體。"
  Pop $0

  ${NSD_CreateGroupBox} 0 88u 100% 68u "這次安裝會設定"
  Pop $0

  ${NSD_CreateLabel} 12u 108u 90% 10u "01  程式安裝位置"
  Pop $0
  SetCtlColors $0 0x684BDB transparent

  ${NSD_CreateLabel} 12u 124u 90% 10u "02  Han Burger Desktop 專案資料夾"
  Pop $0
  SetCtlColors $0 0x684BDB transparent

  ${NSD_CreateLabel} 12u 140u 90% 10u "03  啟動後自動檢查 Desktop 與已安裝專案更新"
  Pop $0
  SetCtlColors $0 0x684BDB transparent

  nsDialogs::Show
FunctionEnd

Function WelcomePageLeave
FunctionEnd

Function ProjectDataDirPageCreate
  ${If} $ProjectDataDir == ""
    StrCpy $ProjectDataDir "$APPDATA\han-burger-desktop\app-data"
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 12u "PROJECT DATA"
  Pop $0
  SetCtlColors $0 0x4BA8E1 transparent

  ${NSD_CreateLabel} 0 18u 100% 22u "選擇專案資料夾"
  Pop $0
  CreateFont $1 "Segoe UI" 15 700
  SendMessage $0 ${WM_SETFONT} $1 1

  ${NSD_CreateLabel} 0 48u 100% 24u "Watch 等專案資料、設定、快取與錯誤報告會儲存在這裡。更新時不會再次詢問，也不會覆蓋這個設定。"
  Pop $0

  ${NSD_CreateGroupBox} 0 84u 100% 54u "Han Burger Desktop 專案資料夾"
  Pop $0

  ${NSD_CreateDirRequest} 12u 106u 68% 12u "$ProjectDataDir"
  Pop $ProjectDataDirInput

  ${NSD_CreateBrowseButton} 82% 105u 16% 14u "瀏覽..."
  Pop $0
  ${NSD_OnClick} $0 ProjectDataDirBrowse

  ${NSD_CreateLabel} 12u 146u 90% 10u "建議放在空間足夠且方便備份的位置。"
  Pop $0
  SetCtlColors $0 0x98A9BC transparent

  nsDialogs::Show
FunctionEnd

Function ProjectDataDirBrowse
  ${NSD_GetText} $ProjectDataDirInput $ProjectDataDir
  nsDialogs::SelectFolderDialog "選擇 Han Burger Desktop 專案資料夾" "$ProjectDataDir"
  Pop $0

  ${If} $0 != error
    StrCpy $ProjectDataDir $0
    ${NSD_SetText} $ProjectDataDirInput "$ProjectDataDir"
  ${EndIf}
FunctionEnd

Function ProjectDataDirPageLeave
  ${NSD_GetText} $ProjectDataDirInput $ProjectDataDir

  ${If} $ProjectDataDir == ""
    MessageBox MB_ICONEXCLAMATION "請選擇專案資料夾。"
    Abort
  ${EndIf}
FunctionEnd

!macro customInstall
  ${IfNot} ${isUpdated}
    ${If} $ProjectDataDir == ""
      StrCpy $ProjectDataDir "$APPDATA\han-burger-desktop\app-data"
    ${EndIf}

    CreateDirectory "$APPDATA\han-burger-desktop"
    IfFileExists "$APPDATA\han-burger-desktop\data-root.txt" DataRootWriteDone 0
    FileOpen $0 "$APPDATA\han-burger-desktop\data-root.txt" w
    FileWrite $0 "$ProjectDataDir"
    FileClose $0
    DataRootWriteDone:
  ${EndIf}
!macroend

!endif
