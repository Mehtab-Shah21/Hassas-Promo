; PRO Invoicing -- Windows installer.
;
; Two install roles, chosen on a custom wizard page:
;   - Server / Standalone: installs the backend (ProInvoicingServer.exe, the
;     database engine + API) AND the desktop client (ProInvoicing.exe, the
;     native window the user actually clicks). Registers a Scheduled Task so
;     the backend starts automatically at boot, before anyone logs in.
;   - Client Only: installs just the desktop client, which talks to a
;     Server/Standalone install elsewhere on the LAN (its address is entered
;     once inside the app itself, on first run).
;
; Build (from installer/, after building both .exe files -- see
; backend/packaging/README.md):
;   "C:\Users\<you>\AppData\Local\Programs\Inno Setup 6\ISCC.exe" pro_invoicing.iss

#define MyAppName "PRO Invoicing"
#define MyAppVersion "1.1.0"
#define MyAppPublisher "MS Software Solutions"
#define MyAppExeName "ProInvoicing.exe"
#define MyServerExeName "ProInvoicingServer.exe"
#define MyTaskName "PROInvoicingServer"

[Setup]
; Fixed AppId so re-running the installer (an upgrade) updates the same
; install rather than creating a second, parallel one.
AppId={{B6B6E9C4-6B0E-4B4B-9B7C-4B7C0B6A2E01}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=no
LicenseFile=EULA.txt
OutputDir=Output
OutputBaseFilename=PROInvoicing-Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
; Installs a boot-time Scheduled Task and (optionally) a firewall rule --
; both need an elevated installer.
PrivilegesRequired=admin
WizardStyle=modern
SetupIconFile=..\backend\packaging\app_icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
; Encrypts the installer and shows a password page before Welcome -- the
; distributable .exe itself won't run without this.
Password=MS_SS_Hassas&IIM@2026

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"
Name: "lanaccess"; Description: "Allow other cashier terminals to connect to this PC over the local network"; GroupDescription: "Network:"; Check: IsServerMode

[Files]
Source: "..\backend\dist\{#MyServerExeName}"; DestDir: "{app}"; Check: IsServerMode; Flags: ignoreversion
Source: "..\backend\dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\backend\packaging\app_icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app_icon.ico"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app_icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: postinstall skipifsilent nowait

[UninstallRun]
; Best-effort cleanup -- Check functions read the same shell-config.json
; the install step wrote, since a custom wizard page's answers don't exist
; at uninstall time. Errors here (task/rule already gone) are ignored.
Filename: "{sys}\schtasks.exe"; Parameters: "/End /TN ""{#MyTaskName}"""; Flags: runhidden; Check: WasServerInstall; RunOnceId: "StopTask"
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /TN ""{#MyTaskName}"" /F"; Flags: runhidden; Check: WasServerInstall; RunOnceId: "DeleteTask"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""PRO Invoicing Server"""; Flags: runhidden; Check: WasServerInstall; RunOnceId: "RemoveFirewallRule"
Filename: "{sys}\taskkill.exe"; Parameters: "/IM {#MyServerExeName} /F"; Flags: runhidden; Check: WasServerInstall; RunOnceId: "KillServer"
Filename: "{sys}\taskkill.exe"; Parameters: "/IM {#MyAppExeName} /F"; Flags: runhidden; RunOnceId: "KillShell"

[Code]
var
  InstallTypePage: TWizardPage;
  ServerRadio, ClientRadio: TNewRadioButton;
  PortPage: TInputQueryWizardPage;

{ ---------- Installation Type page ---------- }

procedure InitializeWizardInstallType;
begin
  InstallTypePage := CreateCustomPage(wpLicense, 'Installation Type', 'How will {#MyAppName} run on this PC?');

  ServerRadio := TNewRadioButton.Create(InstallTypePage);
  ServerRadio.Parent := InstallTypePage.Surface;
  ServerRadio.Left := 0;
  ServerRadio.Top := 0;
  ServerRadio.Width := InstallTypePage.SurfaceWidth;
  ServerRadio.Height := 32;
  ServerRadio.Caption := 'Server / Standalone';
  ServerRadio.Checked := True;
  ServerRadio.Font.Style := [fsBold];

  with TNewStaticText.Create(InstallTypePage) do
  begin
    Parent := InstallTypePage.Surface;
    Left := 18;
    Top := ServerRadio.Top + 22;
    Width := InstallTypePage.SurfaceWidth - 18;
    Height := 40;
    WordWrap := True;
    Caption := 'The main PC. Installs the app, the database and the background server on this computer. Choose this for a single-PC setup, or for the one main PC that other tills connect to.';
  end;

  ClientRadio := TNewRadioButton.Create(InstallTypePage);
  ClientRadio.Parent := InstallTypePage.Surface;
  ClientRadio.Left := 0;
  ClientRadio.Top := ServerRadio.Top + 78;
  ClientRadio.Width := InstallTypePage.SurfaceWidth;
  ClientRadio.Height := 32;
  ClientRadio.Caption := 'Client Only';
  ClientRadio.Font.Style := [fsBold];

  with TNewStaticText.Create(InstallTypePage) do
  begin
    Parent := InstallTypePage.Surface;
    Left := 18;
    Top := ClientRadio.Top + 22;
    Width := InstallTypePage.SurfaceWidth - 18;
    Height := 40;
    WordWrap := True;
    Caption := 'An additional till / cashier terminal. Installs only the app, which connects to your main Server PC over the local network. Requires a Server / Standalone install on another PC.';
  end;
end;

function IsServerMode: Boolean;
begin
  Result := (ServerRadio = nil) or ServerRadio.Checked;
end;

{ ---------- Port Configuration page (server role only) ---------- }

procedure InitializeWizardPort;
begin
  PortPage := CreateInputQueryPage(InstallTypePage.ID,
    'Port Configuration', 'Configure the server port',
    '{#MyAppName} runs a local server that needs a free TCP port.' + #13#10 +
    'The default is 8000. If another application uses that port, change it here.' + #13#10#13#10 +
    'The server will also auto-detect and switch to a free port at runtime if needed.');
  PortPage.Add('Server Port:', False);
  PortPage.Values[0] := '8000';
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if (PortPage <> nil) and (PageID = PortPage.ID) then
    Result := not IsServerMode;
end;

function GetPort: String;
begin
  if (PortPage <> nil) and (Trim(PortPage.Values[0]) <> '') then
    Result := Trim(PortPage.Values[0])
  else
    Result := '8000';
end;

procedure InitializeWizard;
begin
  InitializeWizardInstallType;
  InitializeWizardPort;
end;

{ ---------- Post-install: scheduled task, firewall, config files ---------- }

function JsonEscapePath(const S: String): String;
var
  Temp: String;
begin
  { A Windows path's backslashes must be doubled to be valid inside a JSON
    string -- written out by hand here since there's no JSON library in
    Inno's Pascal Script. StringChangeEx modifies its argument by reference
    and returns a replacement count, not a string, hence the local var. }
  Temp := S;
  StringChangeEx(Temp, '\', '\\', True);
  Result := Temp;
end;

function AppDataDir: String;
begin
  Result := ExpandConstant('{commonappdata}') + '\ProInvoicing';
end;

procedure WriteServerConfig(const Port, Host: String);
var
  BatPath, ConfigPath, BatContent, ConfigContent: String;
begin
  ForceDirectories(AppDataDir);

  BatPath := AppDataDir + '\run-backend.bat';
  BatContent :=
    '@echo off' + #13#10 +
    'set "HOST=' + Host + '"' + #13#10 +
    'set "PORT=' + Port + '"' + #13#10 +
    '"' + ExpandConstant('{app}') + '\{#MyServerExeName}"' + #13#10;
  SaveStringToFile(BatPath, BatContent, False);

  ConfigPath := AppDataDir + '\shell-config.json';
  ConfigContent := '{"mode": "server", "port": ' + Port + ', "backend_exe": "' + JsonEscapePath(BatPath) + '"}';
  SaveStringToFile(ConfigPath, ConfigContent, False);
end;

procedure WriteClientConfig;
begin
  ForceDirectories(AppDataDir);
  SaveStringToFile(AppDataDir + '\shell-config.json', '{"mode": "client"}', False);
end;

procedure RegisterServerTask(const BatPath: String);
var
  ResultCode: Integer;
begin
  { A single pair of quotes around the /TR value is correct for schtasks.exe
    -- Pascal strings have no backslash-escaping (unlike C/JSON), so an
    earlier version of this line that wrote \" here produced a LITERAL
    backslash character next to the quote, corrupting the path. Confirmed
    by testing both forms directly against schtasks.exe: the doubled-
    backslash form failed with "Invalid argument/option", this form parses
    correctly (and fails only on the expected "Access is denied" when not
    elevated, which the real installer always is). }
  Exec(ExpandConstant('{sys}\schtasks.exe'),
    '/Create /F /SC ONSTART /RU SYSTEM /RL HIGHEST /TN "{#MyTaskName}" /TR "' + BatPath + '"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  { Also start it right now, so the very first launch after install doesn't
    have to wait for a reboot. }
  Exec(ExpandConstant('{sys}\schtasks.exe'), '/Run /TN "{#MyTaskName}"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure OpenFirewallPort(const Port: String);
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\netsh.exe'),
    'advfirewall firewall add rule name="PRO Invoicing Server" dir=in action=allow protocol=TCP localport=' + Port,
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Port, Host: String;
begin
  if CurStep = ssPostInstall then
  begin
    if IsServerMode then
    begin
      Port := GetPort;
      if WizardIsTaskSelected('lanaccess') then
        Host := '0.0.0.0'
      else
        Host := '127.0.0.1';
      WriteServerConfig(Port, Host);
      RegisterServerTask(AppDataDir + '\run-backend.bat');
      if WizardIsTaskSelected('lanaccess') then
        OpenFirewallPort(Port);
    end
    else
      WriteClientConfig;
  end;
end;

{ ---------- Uninstall: was this a server install? (read config back) ---------- }

function WasServerInstall: Boolean;
var
  Contents: AnsiString;
begin
  Result := False;
  if LoadStringFromFile(AppDataDir + '\shell-config.json', Contents) then
    Result := Pos('"mode": "server"', String(Contents)) > 0;
end;
