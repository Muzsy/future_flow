param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('Install','Inspect','Remove','Run')]
    [string]$Action,
    [string]$NodePath
)
$ErrorActionPreference = 'Stop'
$taskName = 'Alterward encrypted backup sync'
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($Action -eq 'Inspect') {
    if ($null -eq $task) { @{ installed=$false } | ConvertTo-Json -Compress; exit 0 }
    $info = Get-ScheduledTaskInfo -TaskName $taskName
    @{ installed=$true; state=[string]$task.State; lastResult=$info.LastTaskResult; lastRun=$info.LastRunTime.ToUniversalTime().ToString('o'); nextRun=$info.NextRunTime.ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress
    exit 0
}
if ($Action -eq 'Run') {
    if ($null -eq $task) { throw 'Task is not installed' }
    Start-ScheduledTask -TaskName $taskName
    @{ started=$true } | ConvertTo-Json -Compress
    exit 0
}
if ($Action -eq 'Remove') {
    if ($null -ne $task) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
    @{ installed=$false; archivesDeleted=$false } | ConvertTo-Json -Compress
    exit 0
}
if ($null -ne $task) { throw 'Existing task requires an explicit reviewed update' }
$workspacePath = (Get-Location).Path
$wrapperPath = Join-Path $workspacePath 'scripts\contabo-daily.mjs'
$privatePath = Join-Path $workspacePath '.local\contabo-daily'
if (-not (Test-Path -LiteralPath $privatePath -PathType Container)) { throw 'Private daily directory is required' }
if ([string]::IsNullOrWhiteSpace($NodePath) -or -not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw 'Pinned Node 24 path is required' }
$wrapperHash = (Get-FileHash -LiteralPath $wrapperPath -Algorithm SHA256).Hash
$nodeHash = (Get-FileHash -LiteralPath $NodePath -Algorithm SHA256).Hash
$scriptPath = Join-Path $privatePath 'sync-task.ps1'
if (Test-Path -LiteralPath $scriptPath) { throw 'Existing private task script cannot be overwritten' }
$template = @'
$ErrorActionPreference = 'Stop'
$nodePath = '__NODE__'
$wrapperPath = '__WRAPPER__'
$workspacePath = '__WORKSPACE__'
$logPath = '__LOG__'
try {
    if ((Get-FileHash -LiteralPath $nodePath -Algorithm SHA256).Hash -ne '__NODE_HASH__') { throw 'Pinned Node changed' }
    if ((Get-FileHash -LiteralPath $wrapperPath -Algorithm SHA256).Hash -ne '__WRAPPER_HASH__') { throw 'Pinned sync source changed' }
    Set-Location -LiteralPath $workspacePath
    & $nodePath $wrapperPath --sync *> $logPath
    exit $LASTEXITCODE
} catch {
    'Private backup sync failed; inspect the operator evidence.' | Set-Content -LiteralPath $logPath -Encoding UTF8
    exit 1
}
'@
$content = $template.Replace('__NODE__',$NodePath.Replace("'","''")).Replace('__WRAPPER__',$wrapperPath.Replace("'","''")).Replace('__WORKSPACE__',$workspacePath.Replace("'","''")).Replace('__LOG__',(Join-Path $privatePath 'sync-task.log').Replace("'","''")).Replace('__NODE_HASH__',$nodeHash).Replace('__WRAPPER_HASH__',$wrapperHash)
Set-Content -LiteralPath $scriptPath -Value $content -Encoding UTF8
$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$principal = New-ScheduledTaskPrincipal -UserId $currentSid -LogonType Interactive -RunLevel Limited
$command = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $scriptPath + '"') -WorkingDirectory $workspacePath
$triggers = @(
    (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 1)),
    (New-ScheduledTaskTrigger -AtLogOn -User $currentSid)
)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $command -Trigger $triggers -Principal $principal -Settings $settings -Description 'Hourly encrypted Alterward backup sync and seven-day local expiry while this user is signed in.' | Out-Null
@{ installed=$true; hourly=$true; interactiveUserOnly=$true; passwordStored=$false; sourceHash=$wrapperHash; nodeHash=$nodeHash; localMachineIndependentRedundancy=$false } | ConvertTo-Json -Compress
