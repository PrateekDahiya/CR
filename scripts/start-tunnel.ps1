# start-tunnel.ps1 - play the game on a phone through ngrok
#
#   1. a tiny proxy (scripts/tunnel-proxy.js) that puts the app (:3000) and
#      the game server (:4000) behind ONE public origin
#   2. one ngrok tunnel -> that origin
#   3. the frontend dev server restarted with NEXT_PUBLIC_BACKEND_URL set to
#      the public URL (the browser must talk to the tunnel, not to localhost)
#
# Requirements:
#   - ngrok (winget install ngrok) with a free account and an authtoken in
#     %LOCALAPPDATA%\ngrok\ngrok.yml
#   - the backend (:4000) and the frontend (:3000) running
#
# Run from the repo root:
#   powershell -ExecutionPolicy Bypass -File scripts/start-tunnel.ps1
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$local = $env:TEMP + "\cr-local"
New-Item -ItemType Directory -Force -Path $local | Out-Null

# --- the authtoken (read from the local ngrok config, never committed) ---
$ngrokConfig = Join-Path $env:LOCALAPPDATA "ngrok\ngrok.yml"
$ngrokToken = ""
if (Test-Path $ngrokConfig) {
  $ngrokToken = ([regex]::Match((Get-Content $ngrokConfig -Raw), "authtoken:\s*(\S+)")).Groups[1].Value
}
if ($ngrokToken -eq "") {
  Write-Host "No ngrok authtoken found in $ngrokConfig - run 'ngrok config add-authtoken <token>' first."
  exit 1
}

# --- 1. the proxy -----------------------------------------------------
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match "tunnel-proxy" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Process -FilePath "node" -ArgumentList "$root\scripts\tunnel-proxy.js" -WindowStyle Hidden `
  -RedirectStandardOutput "$local\proxy.log" -RedirectStandardError "$local\proxy.err.log"
Start-Sleep -Seconds 2

# --- 2. the tunnel ----------------------------------------------------
Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
$env:NGROK_AUTHTOKEN = $ngrokToken
Start-Process -FilePath "ngrok" -ArgumentList "http", "8099", "--log", "stdout" -WindowStyle Hidden `
  -RedirectStandardOutput "$local\ngrok-game.log" -RedirectStandardError "$local\ngrok-game.err.log"
Start-Sleep -Seconds 10
$url = ""
try {
  $tunnels = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -TimeoutSec 8
  $url = ($tunnels.tunnels | Where-Object { $_.public_url -like "*.ngrok*" } | Select-Object -First 1).public_url
} catch {}
if ($url -eq "") { Write-Host "ngrok did not come up - see $local\ngrok-game.err.log"; exit 1 }
Write-Host "public URL: $url"

# --- 3. the frontend with the public backend URL ---------------------
$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force }
Start-Sleep -Seconds 3
$cmd = "`$env:NEXT_PUBLIC_BACKEND_URL='$url'; `$env:NEXT_PUBLIC_AI_URL='$url'; " +
  "Set-Location '$root\frontend'; npm.cmd run dev"
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $cmd -WindowStyle Hidden `
  -RedirectStandardOutput "$local\frontend-tunnel.log" -RedirectStandardError "$local\frontend-tunnel.err.log"
Write-Host "frontend restarting with NEXT_PUBLIC_BACKEND_URL=$url"
Write-Host ""
Write-Host "Open on your phone: $url"
Write-Host "(the first visit shows ngrok's 'Visit Site' warning - tap it once)"
