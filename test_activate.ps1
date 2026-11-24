$wshell = New-Object -ComObject WScript.Shell
$success = $wshell.AppActivate("WhatsApp")
Write-Host "AppActivate WhatsApp result: $success"
if (-not $success) {
    $success = $wshell.AppActivate("Google Chrome")
    Write-Host "AppActivate Google Chrome result: $success"
}
