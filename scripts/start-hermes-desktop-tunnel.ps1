$ErrorActionPreference = "Stop"

$server = "120.26.121.247"
$localPort = 9119
$keyPath = Join-Path $env:USERPROFILE ".ssh\hermes-desktop-tunnel"
$tokenPath = Join-Path $env:LOCALAPPDATA "hermes\launcher\remote-token"
$watchdogPath = Join-Path $env:LOCALAPPDATA "hermes\launcher\ensure-tunnel.ps1"
$connectionUser = "hermes"

if (-not (Test-Path -LiteralPath $keyPath)) {
  throw "找不到 Hermes Desktop 专用连接密钥：$keyPath"
}
if (-not (Test-Path -LiteralPath $tokenPath)) {
  throw "找不到 Hermes Desktop 远程会话令牌：$tokenPath"
}
$remoteToken = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
if (-not $remoteToken) {
  throw "Hermes Desktop 远程会话令牌为空"
}

$existing = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $localPort -State Listen -ErrorAction SilentlyContinue
if (-not $existing -and (Test-Path -LiteralPath $watchdogPath)) {
  $watchdog = Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", $watchdogPath
  ) -WindowStyle Hidden -Wait -PassThru
  if ($watchdog.ExitCode -ne 0) {
    throw "Hermes Desktop 安全隧道自动恢复失败，请查看本机 tunnel-watchdog.log"
  }
  $existing = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $localPort -State Listen -ErrorAction SilentlyContinue
}
if (-not $existing) {
  Start-Process -FilePath "$env:WINDIR\System32\OpenSSH\ssh.exe" -ArgumentList @(
    "-N", "-T",
    "-o", "BatchMode=yes",
    "-o", "ExitOnForwardFailure=yes",
    "-o", "ConnectTimeout=15",
    "-o", "ConnectionAttempts=3",
    "-o", "ServerAliveInterval=15",
    "-o", "ServerAliveCountMax=2",
    "-o", "TCPKeepAlive=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-i", $keyPath,
    "-L", "127.0.0.1:${localPort}:127.0.0.1:${localPort}",
    "${connectionUser}@${server}"
  ) -WindowStyle Hidden | Out-Null
  $deadline = (Get-Date).AddSeconds(30)
  do {
    Start-Sleep -Seconds 1
    $existing = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $localPort -State Listen -ErrorAction SilentlyContinue
  } while (-not $existing -and (Get-Date) -lt $deadline)
  if (-not $existing) { throw "Hermes Desktop 安全隧道连接超时" }
}

$desktopCandidates = @(
  (Join-Path $env:LOCALAPPDATA "hermes\hermes-agent\apps\desktop\release\win-unpacked\Hermes.exe"),
  (Join-Path $env:LOCALAPPDATA "Programs\Hermes\Hermes.exe"),
  (Join-Path $env:LOCALAPPDATA "Programs\Hermes Agent\Hermes Agent.exe"),
  (Join-Path $env:LOCALAPPDATA "Hermes\Hermes.exe")
)
$desktopApp = $desktopCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($desktopApp) {
  $env:HERMES_DESKTOP_REMOTE_URL = "http://127.0.0.1:$localPort"
  $env:HERMES_DESKTOP_REMOTE_TOKEN = $remoteToken
  Start-Process -FilePath $desktopApp
} else {
  Start-Process "http://127.0.0.1:$localPort"
}
