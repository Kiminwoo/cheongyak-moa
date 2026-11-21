$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node.exe).Source
$publisher = Join-Path $PSScriptRoot 'publish-daily-data.mjs'
if ((& git.exe -C $root branch --show-current) -ne 'main') {
    throw 'Run this installer from the dedicated main checkout.'
}

$firstUtc = [DateTime]::UtcNow.Date.AddHours(23)
if ($firstUtc -le [DateTime]::UtcNow) {
    $firstUtc = $firstUtc.AddDays(1)
}
$trigger = New-ScheduledTaskTrigger -Daily -At ($firstUtc.ToLocalTime())
$trigger.StartBoundary = $firstUtc.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")

$action = New-ScheduledTaskAction -Execute $node -Argument ('"' + $publisher + '"') -WorkingDirectory $root
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive
Register-ScheduledTask -TaskName 'CheongyakMoa Daily Refresh' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Output 'Registered CheongyakMoa Daily Refresh at 08:00 KST (23:00 UTC).'
