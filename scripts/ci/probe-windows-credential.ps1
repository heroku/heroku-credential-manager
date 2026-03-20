$ErrorActionPreference = 'Continue'

$vaultTypeLoad = '[void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]'

Write-Host "=== powershell -> $((Get-Command powershell).Source) ==="

Write-Host '=== PasswordVault in this PowerShell session ==='
try {
  Invoke-Expression $vaultTypeLoad
  Write-Host 'OK: type loaded'
} catch {
  Write-Host "FAILED: $($_.Exception.Message)"
}

Write-Host '=== Child powershell -Command (same pattern as each execSync) ==='
& powershell -NoProfile -NonInteractive -Command $vaultTypeLoad
if ($LASTEXITCODE -ne 0) {
  Write-Host "FAILED: child exited with code $LASTEXITCODE"
} else {
  Write-Host 'OK: child loaded PasswordVault type'
}
