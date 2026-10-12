@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  start "Mujic Static Server" /min cmd /k "cd /d ""%~dp0"" && py -m http.server 3000 --bind 127.0.0.1"
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python 3 is required only to serve the static PWA locally.
    echo Install Python, then run this file again. No custom API server is used.
    pause
    exit /b 1
  )
  start "Mujic Static Server" /min cmd /k "cd /d ""%~dp0"" && python -m http.server 3000 --bind 127.0.0.1"
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='http://127.0.0.1:3000/index.html'; for($i=0;$i -lt 60;$i++){ try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1 | Out-Null; Start-Process $url; exit 0 } catch { Start-Sleep -Milliseconds 300 } }; Write-Host 'Mujic did not start. Check the Python static server window.'; pause"
endlocal
