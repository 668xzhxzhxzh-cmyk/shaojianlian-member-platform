$ErrorActionPreference = "Stop"

$server = "120.26.121.247"
$localPort = 9119
$keyPath = Join-Path $env:USERPROFILE ".ssh\shao-hermes-desktop-v2"
$tokenPath = Join-Path $env:LOCALAPPDATA "hermes\launcher\remote-token"
$connectionUser = "hermesdesktop"

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

$existing = Get-NetTCPConnection -LocalPort $localPort -State Listen -ErrorAction SilentlyContinue
if (-not $existing) {
  Start-Process -FilePath "ssh.exe" -ArgumentList @(
    "-N",
    "-T",
    "-i", $keyPath,
    "-o", "ExitOnForwardFailure=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ServerAliveInterval=30",
    "-o", "ServerAliveCountMax=3",
    "-L", "${localPort}:127.0.0.1:${localPort}",
    "${connectionUser}@${server}"
  ) -WindowStyle Hidden
  Start-Sleep -Seconds 2
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
