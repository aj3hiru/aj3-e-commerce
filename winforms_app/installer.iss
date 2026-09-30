; Installer for the Windows software (built by .github/workflows/winforms-app.yml with Inno Setup 6).
; Installs for the current Windows user (no admin needed), adds Start menu + Desktop shortcuts and an
; uninstaller. The data on the computer (%LocalAppData%\SriAndalStaff) is never removed by an update
; or by uninstalling, so nothing waiting to be sent is ever lost.
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceExe
  #define SourceExe "out\SriAndalStaff.exe"
#endif

[Setup]
AppId={{6F1C2A8E-4B7D-4E1A-9C3F-5A2D8B7E1C40}
AppName=Sri Andal Staff
AppVersion={#AppVersion}
AppVerName=Sri Andal Staff {#AppVersion}
AppPublisher=Sri Andal Traders
DefaultDirName={localappdata}\Programs\Sri Andal Staff
DefaultGroupName=Sri Andal Staff
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
OutputDir=.
OutputBaseFilename=SriAndalStaff-Setup-{#AppVersion}
SetupIconFile=app.ico
UninstallDisplayIcon={app}\SriAndalStaff.exe
UninstallDisplayName=Sri Andal Staff
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "{#SourceExe}"; DestDir: "{app}"; DestName: "SriAndalStaff.exe"; Flags: ignoreversion

[Icons]
Name: "{group}\Sri Andal Staff"; Filename: "{app}\SriAndalStaff.exe"
Name: "{userdesktop}\Sri Andal Staff"; Filename: "{app}\SriAndalStaff.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\SriAndalStaff.exe"; Description: "Open Sri Andal Staff now"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Uninstalling signs out: the next install asks for the login again. The shop data and changes not sent yet
; stay on the computer (nothing is lost), only the saved login token is removed.
Type: files; Name: "{localappdata}\SriAndalStaff\token.bin"
