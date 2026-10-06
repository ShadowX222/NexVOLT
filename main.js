const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');

const isWindows = process.platform === 'win32';
const stateDir = path.join(app.getPath('userData'), 'state');
const backupFile = path.join(stateDir, 'nexvolt-backups.json');

function ensureStateDir() {
  fs.mkdirSync(stateDir, { recursive: true });
}

function readBackups() {
  try { return JSON.parse(fs.readFileSync(backupFile, 'utf8')); } catch { return {}; }
}

function writeBackups(data) {
  ensureStateDir();
  fs.writeFileSync(backupFile, JSON.stringify(data, null, 2), 'utf8');
}

function ps(script, args = []) {
  return new Promise((resolve, reject) => {
    if (!isWindows) return reject(new Error('NexVOLT native Windows functions require Windows.'));
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script, ...args],
      { windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) return reject(new Error((stderr || error.message).trim()));
        resolve(stdout.trim());
      });
  });
}

async function getSystemInfo() {
  if (!isWindows) throw new Error('Windows-only native detection.');
  const script = `
$ErrorActionPreference='Stop'
$cpu=Get-CimInstance Win32_Processor | Select-Object -First 1 Name,NumberOfCores,NumberOfLogicalProcessors,LoadPercentage
$os=Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber
$ram=Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize,FreePhysicalMemory
$gpus=@(Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM)
$disks=@(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,FileSystem,Size,FreeSpace)
$gameMode=(Get-ItemProperty -Path 'HKCU:\Software\Microsoft\GameBar' -Name AllowAutoGameMode -ErrorAction SilentlyContinue).AllowAutoGameMode
$hags=(Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers' -Name HwSchMode -ErrorAction SilentlyContinue).HwSchMode
$power=(powercfg /getactivescheme | Out-String).Trim()
[pscustomobject]@{
 cpu=$cpu; os=$os; ram=$ram; gpus=$gpus; disks=$disks; gameMode=$gameMode; hags=$hags; powerPlan=$power
} | ConvertTo-Json -Depth 5
`;
  const raw = await ps(script);
  const x = JSON.parse(raw);
  const totalGB = Math.max(0, Math.round(Number(x.ram.TotalVisibleMemorySize) / 1048576 * 10) / 10);
  const freeGB = Math.max(0, Math.round(Number(x.ram.FreePhysicalMemory) / 1048576 * 10) / 10);
  const gpus = Array.isArray(x.gpus) ? x.gpus : (x.gpus ? [x.gpus] : []);
  const disks = Array.isArray(x.disks) ? x.disks : (x.disks ? [x.disks] : []);
  return {
    cpu: { name: x.cpu?.Name || 'Unknown CPU', cores: Number(x.cpu?.NumberOfCores || 0), threads: Number(x.cpu?.NumberOfLogicalProcessors || 0), usagePct: Number(x.cpu?.LoadPercentage || 0) },
    gpu: { name: gpus.map(g => g.Name).filter(Boolean).join(' / ') || 'Unknown GPU', vramGB: Math.round((gpus.reduce((n,g)=>n+Number(g.AdapterRAM||0),0)/1073741824)*10)/10, usagePct: 0 },
    ram: { totalGB, usedGB: Math.max(0, Math.round((totalGB-freeGB)*10)/10) },
    storage: disks.map(d => ({ drive: d.DeviceID, type: d.FileSystem || 'Local Disk', freeGB: Math.round(Number(d.FreeSpace||0)/1073741824), totalGB: Math.round(Number(d.Size||0)/1073741824) })),
    os: { version: x.os?.Caption || 'Windows', build: x.os?.BuildNumber || x.os?.Version || 'Unknown' },
    win: { gameMode: Number(x.gameMode || 0) === 1, hags: Number(x.hags || 0) === 2, powerPlan: x.powerPlan || 'Unknown' }
  };
}

const gameDefs = [
  ['gta5','GTA5.exe'],['fivem','FiveM.exe'],['valorant','VALORANT-Win64-Shipping.exe'],['cs2','cs2.exe'],['fortnite','FortniteClient-Win64-Shipping.exe'],['apex','r5apex.exe'],['pubg','TslGame.exe'],['cod','cod.exe'],['minecraft','javaw.exe'],['rdr2','RDR2.exe'],['cyberpunk','Cyberpunk2077.exe'],['forza','ForzaHorizon5.exe'],['r6siege','RainbowSix.exe']
];

async function detectGames() {
  if (!isWindows) return {};
  const defs = JSON.stringify(gameDefs);
  const script = `
$defs=${defs} | ConvertFrom-Json
$roots=@($env:ProgramFiles,$env:ProgramFiles\' (x86)',$env:ProgramData,'C:\\Games') | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
$result=@{}
foreach($d in $defs){ $id=$d[0]; $exe=$d[1]; $found=$null; foreach($r in $roots){ try { $found=Get-ChildItem -LiteralPath $r -Filter $exe -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName; if($found){break} } catch {} }; $result[$id]=$found }
$result | ConvertTo-Json
`;
  const raw = await ps(script);
  return JSON.parse(raw || '{}');
}

async function saveBackup(id, changes) {
  const all = readBackups();
  all[id] = { id, createdAt: new Date().toISOString(), changes };
  writeBackups(all);
  return all[id];
}

async function applyOperation(id, context = {}) {
  if (!isWindows) throw new Error('Windows-only operation.');
  const backupId = context.backupId || `backup-${Date.now()}`;
  const before = {};
  let message = '';

  if (id === 'power-plan') {
    before.power = await ps("(powercfg /getactivescheme | Out-String).Trim()");
    await ps('powercfg /setactive SCHEME_MIN');
    message = 'High Performance power plan enabled.';
  } else if (id === 'game-mode') {
    before.gameMode = await ps("$v=(Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\GameBar' -Name AllowAutoGameMode -ErrorAction SilentlyContinue).AllowAutoGameMode; if($null -eq $v){'__MISSING__'}else{$v}");
    await ps("New-Item -Path 'HKCU:\\Software\\Microsoft\\GameBar' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\GameBar' -Name AllowAutoGameMode -Type DWord -Value 1");
    message = 'Windows Game Mode enabled.';
  } else if (id === 'hags') {
    before.hags = await ps("$v=(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name HwSchMode -ErrorAction SilentlyContinue).HwSchMode; if($null -eq $v){'__MISSING__'}else{$v}");
    await ps("Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name HwSchMode -Type DWord -Value 2");
    message = 'HAGS enabled; Windows may require a restart.';
  } else if (id === 'temp-cleanup') {
    const out = await ps("$before=(Get-ChildItem -LiteralPath $env:TEMP -Force -ErrorAction SilentlyContinue | Measure-Object).Count; Get-ChildItem -LiteralPath $env:TEMP -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue; $after=(Get-ChildItem -LiteralPath $env:TEMP -Force -ErrorAction SilentlyContinue | Measure-Object).Count; [pscustomobject]@{before=$before;after=$after}|ConvertTo-Json");
    before.temp = out;
    message = 'Temporary-file cleanup completed where files were not locked.';
  } else if (id === 'visual-fx') {
    before.visual = await ps("$v=(Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects' -Name VisualFXSetting -ErrorAction SilentlyContinue).VisualFXSetting; if($null -eq $v){'__MISSING__'}else{$v}");
    await ps("New-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects' -Name VisualFXSetting -Type DWord -Value 2");
    message = 'Windows visual effects set toward performance.';
  } else if (id === 'net-throttle') {
    before.netThrottle = await ps("$v=(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name NetworkThrottlingIndex -ErrorAction SilentlyContinue).NetworkThrottlingIndex; if($null -eq $v){'__MISSING__'}else{$v}");
    await ps("Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name NetworkThrottlingIndex -Type DWord -Value 4294967295");
    message = 'Network Throttling Index set to the Windows maximum; reboot may be required.';
  } else if (id.endsWith('-priority')) {
    const exe = context.exe;
    if (!exe) throw new Error('No executable was supplied for process-priority optimization.');
    const escaped = exe.replace(/'/g,"''");
    const result = await ps(`$p=Get-Process -Name '${escaped.replace(/\.exe$/i,'')}' -ErrorAction SilentlyContinue; if($p){$p.PriorityClass='High'; 'updated'}else{'not-running'}`);
    message = result === 'updated' ? `Set ${exe} process priority to High.` : `${exe} is not currently running; no process priority was changed.`;
  } else {
    // Informational/review items intentionally do not change the system.
    message = `${id} is an informational/review item and made no system change.`;
  }

  await saveBackup(backupId, { ...before, operation:id, context });
  return { backupId, message, changed: !['fullscreen-opt','startup-apps'].includes(id) };
}

async function restoreBackup(backupId) {
  const all = readBackups();
  const b = all[backupId];
  if (!b) throw new Error('Backup record not found.');
  const c = b.changes || {};
  if (c.power && c.power.match(/([A-Fa-f0-9-]{36})/)) await ps(`powercfg /setactive ${RegExp.$1}`);
  if (c.gameMode !== undefined) {
    if (c.gameMode === '__MISSING__') await ps("Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\GameBar' -Name AllowAutoGameMode -ErrorAction SilentlyContinue");
    else await ps(`New-Item -Path 'HKCU:\\Software\\Microsoft\\GameBar' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\GameBar' -Name AllowAutoGameMode -Type DWord -Value ${Number(c.gameMode)}`);
  }
  if (c.hags !== undefined) {
    if (c.hags === '__MISSING__') await ps("Remove-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name HwSchMode -ErrorAction SilentlyContinue");
    else await ps(`Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name HwSchMode -Type DWord -Value ${Number(c.hags)}`);
  }
  if (c.visual !== undefined) {
    if (c.visual === '__MISSING__') await ps("Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects' -Name VisualFXSetting -ErrorAction SilentlyContinue");
    else await ps(`New-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects' -Name VisualFXSetting -Type DWord -Value ${Number(c.visual)}`);
  }
  if (c.netThrottle !== undefined) {
    if (c.netThrottle === '__MISSING__') await ps("Remove-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name NetworkThrottlingIndex -ErrorAction SilentlyContinue");
    else await ps(`Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name NetworkThrottlingIndex -Type DWord -Value ${Number(c.netThrottle)}`);
  }
  return { restored:true };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 650,
    backgroundColor: '#000000',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.setWindowOpenHandler(({url}) => { shell.openExternal(url); return { action:'deny' }; });
}

ipcMain.handle('system-info', getSystemInfo);
ipcMain.handle('detect-games', detectGames);
ipcMain.handle('apply-operation', (_e, id, context) => applyOperation(id, context || {}));
ipcMain.handle('restore-backup', (_e, id) => restoreBackup(id));
ipcMain.handle('list-backups', () => readBackups());
ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));
ipcMain.handle('is-admin', async () => {
  if (!isWindows) return false;
  try {
    const r = await ps("([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)");
    return r.toLowerCase() === 'true';
  } catch { return false; }
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(permission === 'notifications'));
  ensureStateDir();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
