@echo off
cd /d "%~dp0"
echo Starting Atlas...
call npm run start:fast
if errorlevel 1 (
  echo.
  echo Atlas exited with an error - see above.
  pause
)
