; Windows installer for the Sri Andal Staff app (built by GitHub Actions with Inno Setup).
#define AppName "Sri Andal Staff"
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{6E1C9C9A-3F2B-4C57-9B7E-5A2E7D0B4A11}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Sri Andal Traders
DefaultDirName={autopf}\Sri Andal Staff
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputBaseFilename=SriAndalStaff-Setup-{#AppVersion}
OutputDir=..\..\build\installer
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\sri_staff.exe
CloseApplications=yes

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "..\..\build\windows\x64\runner\Release\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\sri_staff.exe"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\sri_staff.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\sri_staff.exe"; Description: "Open {#AppName}"; Flags: nowait postinstall skipifsilent
