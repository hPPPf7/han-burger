!include nsDialogs.nsh
!include LogicLib.nsh

!ifndef BUILD_UNINSTALLER

Var ProjectDataDir
Var ProjectDataDirInput

!macro customPageAfterChangeDir
  Page custom ProjectDataDirPageCreate ProjectDataDirPageLeave
!macroend

Function ProjectDataDirPageCreate
  ${If} $ProjectDataDir == ""
    StrCpy $ProjectDataDir "$APPDATA\han-burger-desktop\app-data"
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "選擇 Han Burger Desktop 專案資料夾"
  Pop $0

  ${NSD_CreateLabel} 0 28u 100% 28u "Watch 等專案資料、設定、快取與錯誤報告會儲存在這裡。更新時不會再次詢問，也不會覆蓋這個設定。"
  Pop $0

  ${NSD_CreateDirRequest} 0 64u 78% 12u "$ProjectDataDir"
  Pop $ProjectDataDirInput

  ${NSD_CreateBrowseButton} 80% 63u 20% 14u "瀏覽..."
  Pop $0
  ${NSD_OnClick} $0 ProjectDataDirBrowse

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
    FileOpen $0 "$APPDATA\han-burger-desktop\data-root.txt" w
    FileWrite $0 "$ProjectDataDir"
    FileClose $0
  ${EndIf}
!macroend

!endif
