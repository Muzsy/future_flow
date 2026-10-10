param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('Install','Inspect','Run','Remove')]
    [string]$Action,
    [string]$NodePath,
    [string]$PythonPath,
    [string]$PowerShellPath,
    [string]$SecretsDirectory
)
$ErrorActionPreference = 'Stop'
$taskName = 'Alterward managed recovery sync'
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($Action -eq 'Inspect') {
    if ($null -eq $task) { @{installed=$false} | ConvertTo-Json -Compress; exit 0 }
    $info = Get-ScheduledTaskInfo -TaskName $taskName
    @{installed=$true;state=[string]$task.State;lastResult=$info.LastTaskResult;lastRun=$info.LastRunTime.ToUniversalTime().ToString('o');nextRun=$info.NextRunTime.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress
    exit 0
}
if ($Action -eq 'Run') {
    if ($null -eq $task) { throw 'Original task required' }
    Start-ScheduledTask -TaskName $taskName
    @{started=$true} | ConvertTo-Json -Compress; exit 0
}
if ($Action -eq 'Remove') {
    if ($null -ne $task) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
    @{installed=$false;archivesDeleted=$false} | ConvertTo-Json -Compress; exit 0
}
if ($null -ne $task) { throw 'Existing task requires reviewed source update' }
foreach ($runtime in @($NodePath,$PythonPath,$PowerShellPath)) {
    if (-not [System.IO.Path]::IsPathRooted($runtime) -or -not (Test-Path -LiteralPath $runtime -PathType Leaf)) { throw 'Original absolute runtimes required' }
}
if (-not [System.IO.Path]::IsPathRooted($SecretsDirectory) -or -not (Test-Path -LiteralPath $SecretsDirectory -PathType Container)) { throw 'Original protected SSH directory required' }
foreach ($name in @('contabo_alterward_ed25519','contabo_known_hosts')) {
    $item = Get-Item -LiteralPath (Join-Path $SecretsDirectory $name)
    if ($item.PSIsContainer -or $item.LinkType) { throw 'Original operator credential required' }
}
$workspacePath = (Get-Location).Path
$privatePath = Join-Path $workspacePath '.local\contabo-recovery'
if (-not (Test-Path -LiteralPath $privatePath -PathType Container)) { throw 'Protected recovery evidence directory required' }
$sourcePaths = @(
    'scripts/recovery-local.mjs','scripts/supabase-managed-retention.mts','scripts/legacy-recovery-retention.mts',
    'scripts/lib/managed-retention.ts','scripts/lib/local-managed-recovery.ts','scripts/lib/private-report.ts',
    'scripts/ops/contabo-managed-expiry.py','scripts/ops/local-managed-recovery.py','scripts/ops/legacy-recovery-retention.py',
    'scripts/ops/contabo-recovery-install.py','scripts/contabo-daily.mjs','scripts/ops/contabo-daily-install.py',
    'scripts/ops/contabo-backup.py','scripts/contabo-recovery-sync-task.ps1','pnpm-lock.yaml','package.json'
)
$pins = @()
foreach ($path in $sourcePaths) {
    $absolutePath = Join-Path $workspacePath $path
    $item = Get-Item -LiteralPath $absolutePath
    if ($item.PSIsContainer -or $item.LinkType) { throw 'Original regular source required' }
    $pins += @{path=$absolutePath;hash=(Get-FileHash -LiteralPath $absolutePath -Algorithm SHA256).Hash}
}
foreach ($runtime in @($NodePath,$PythonPath,$PowerShellPath)) {
    $pins += @{path=$runtime;hash=(Get-FileHash -LiteralPath $runtime -Algorithm SHA256).Hash}
}
$tsxPath = Join-Path $workspacePath 'node_modules\tsx\dist'
foreach ($file in (Get-ChildItem -LiteralPath $tsxPath -File -Recurse)) {
    $pins += @{path=$file.FullName;hash=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash}
}
$pinsEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($pins | ConvertTo-Json -Depth 4 -Compress)))
$scriptPath = Join-Path $privatePath 'managed-sync-task.ps1'
if (Test-Path -LiteralPath $scriptPath) { throw 'Original task wrapper cannot be overwritten' }
$template = @'
$ErrorActionPreference = 'Stop'
$nodePath = '__NODE__'
$workspacePath = '__WORKSPACE__'
$logPath = '__LOG__'
$pins = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__PINS__')) | ConvertFrom-Json
try {
    foreach ($pin in $pins) {
        if ((Get-FileHash -LiteralPath $pin.path -Algorithm SHA256).Hash -ne $pin.hash) { throw 'Reviewed source or runtime changed' }
    }
    if ((Get-Process -Id $PID).Path -ne '__POWERSHELL__') { throw 'Original PowerShell required' }
    Set-Location -LiteralPath $workspacePath
    $env:ALTERWARD_PYTHON = '__PYTHON__'
    $env:ALTERWARD_SSH_SECRETS_DIR = '__SECRETS__'
    & $nodePath --env-file=.env scripts/recovery-local.mjs --sync-and-expire *> $logPath
    exit $LASTEXITCODE
} catch {
    'Managed recovery sync failed; inspect private evidence. The server receipt becomes stale if this persists.' | Set-Content -LiteralPath $logPath -Encoding UTF8
    exit 1
}
'@
$content = $template.Replace('__NODE__',$NodePath.Replace("'","''")).Replace('__PYTHON__',$PythonPath.Replace("'","''")).Replace('__POWERSHELL__',$PowerShellPath.Replace("'","''"))
$content = $content.Replace('__WORKSPACE__',$workspacePath.Replace("'","''")).Replace('__SECRETS__',$SecretsDirectory.Replace("'","''")).Replace('__PINS__',$pinsEncoded)
$content = $content.Replace('__LOG__',(Join-Path $privatePath 'managed-sync-task.log').Replace("'","''"))
Set-Content -LiteralPath $scriptPath -Value $content -Encoding UTF8
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$principal = New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited
$command = New-ScheduledTaskAction -Execute $PowerShellPath -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $scriptPath + '"') -WorkingDirectory $workspacePath
$triggers = @(
    (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(7) -RepetitionInterval (New-TimeSpan -Hours 1)),
    (New-ScheduledTaskTrigger -AtLogOn -User $sid)
)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $command -Trigger $triggers -Principal $principal -Settings $settings -Description 'Encrypted application/managed sync, original seven-day expiry and limited server receipt while this user is signed in.' | Out-Null
@{installed=$true;hourly=$true;interactiveUserOnly=$true;passwordStored=$false;credentialsCopied=$false;pinnedFiles=$pins.Count} | ConvertTo-Json -Compress
