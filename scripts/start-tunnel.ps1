# start-tunnel.ps1 - play the game on a phone through a public tunnel
#
#   1. a tiny proxy (scripts/tunnel-proxy.js) that puts the app (:3000) and
#      the game server (:4000) behind ONE public origin
#   2. one public tunnel -> that origin
#   3. the frontend dev server restarted with NEXT_PUBLIC_BACKEND_URL set to
#      the public URL (the browser must talk to the tunnel, not to localhost)
#
# Two tunnel backends:
#
#   cloudflared (default) - a "quick tunnel": no account, no signup and NO
#     warning page, so the app, the REST API and the socket.io websocket all
#     work in the phone's browser straight away.
#     Download: https://github.com/cloudflare/cloudflared/releases/latest
#
#   ngrok (-Provider ngrok) - needs an account + an authtoken in
#     %LOCALAPPDATA%\ngrok\ngrok.yml. The free plan serves a "You are about
#     to visit" interstitial to every browser request and gives one hostname
#     per agent session, so the phone has to tap "Visit Site" once and only
#     one tunnel can be open at a time.
#
# Run from the repo root:
#   powershell -ExecutionPolicy Bypass -File scripts/start-tunnel.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/start-tunnel.ps1 -Provider ngrok
param(
  [ValidateSet("cloudflared", "ngrok")]
  [string]$Provider = "cloudflared"
)
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$local = $env:TEMP + "\cr-local"
$assets = Join-Path $env:LOCALAPPDATA "Temp\cr-assets"
New-Item -ItemType Directory -Force -Path $local | Out-Null

# --- the tunnel backend ------------------------------------------------
$publicUrl = ""
if ($Provider -eq "cloudflared") {
  $cf = Join-Path $assets "cloudflared.exe"
  if (-not (Test-Path $cf)) {
    Write-Host "Downloading cloudflared ..."
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cf -UseBasicParsing -TimeoutSec 600
  }
  Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 1
  Remove-Item "$local\cloudflared.log" -ErrorAction SilentlyContinue
  Start-Process -FilePath $cf -ArgumentList "tunnel", "--url", "http://localhost:8099", "--no-autoupdate", "--logfile", "$local\cloudflared.log" -WindowStyle Hidden `
    -RedirectStandardOutput "$local\cf.out.log" -RedirectStandardError "$local\cf.err.log"
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    $hit = Get-Content "$local\cloudflared.log", "$local\cf.out.log", "$local\cf.err.log" -ErrorAction SilentlyContinue |
      Select-String -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -First 1
    if ($hit) { $publicUrl = ($hit.Line -replace '.*(https://[a-z0-9-]+\.trycloudflare\.com).*', '$1'); break }
  }
} else {
  $ngrokConfig = Join-Path $env:LOCALAPPDATA "ngrok\ngrok.yml"
  $ngrokToken = ""
  if (Test-Path $ngrokConfig) {
    $ngrokToken = ([regex]::Match((Get-Content $ngrokConfig -Raw), "authtoken:\s*(\S+)")).Groups[1].Value
  }
  if ($ngrokToken -eq "") {
    Write-Host "No ngrok authtoken in $ngrokConfig - run 'ngrok config add-authtoken <token>' first."
    exit 1
  }
  Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 1
  $env:NGROK_AUTHTOKEN = $ngrokToken
  Start-Process -FilePath "ngrok" -ArgumentList "http", "8099", "--log", "stdout" -WindowStyle Hidden `
    -RedirectStandardOutput "$local\ngrok-game.log" -RedirectStandardError "$local\ngrok-game.err.log"
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 2
    try {
      $tunnels = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -TimeoutSec 5
      $publicUrl = ($tunnels.tunnels | Where-Object { $_.public_url -like "*.ngrok*" } | Select-Object -First 1).public_url
    } catch {}
    if ($publicUrl -ne "") { break }
  }
}
if ($publicUrl -eq "") { Write-Host "the tunnel did not come up - see $local"; exit 1 }

# --- the proxy ---------------------------------------------------------
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match "tunnel-proxy" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Process -FilePath "node" -ArgumentList "$root\scripts\tunnel-proxy.js" -WindowStyle Hidden `
  -RedirectStandardOutput "$local\proxy.log" -RedirectStandardError "$local\proxy.err.log"
Start-Sleep -Seconds 2

# --- the frontend with the public backend URL -------------------------
$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force }
Start-Sleep -Seconds 3
$cmd = "`$env:NEXT_PUBLIC_BACKEND_URL='$publicUrl'; `$env:NEXT_PUBLIC_AI_URL='$publicUrl'; " +
  "Set-Location '$root\frontend'; npm.cmd run dev"
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $cmd -WindowStyle Hidden `
  -RedirectStandardOutput "$local\frontend-tunnel.log" -RedirectStandardError "$local\frontend-tunnel.err.log"
Write-Host "frontend restarting with NEXT_PUBLIC_BACKEND_URL=$publicUrl"
Write-Host ""
Write-Host "Open on your phone: $publicUrl"
if ($Provider -eq "ngrok") {
  Write-Host "(the first visit shows ngrok's 'Visit Site' warning - tap it once)"
}
