@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 --version >nul 2>nul
  if not errorlevel 1 (
    py -3 "%~dp0run_local.py"
    goto finished
  )
)
where python >nul 2>nul
if not errorlevel 1 (
  python --version >nul 2>nul
  if not errorlevel 1 (
    python "%~dp0run_local.py"
    goto finished
  )
)
echo Python 3 is required. Install it from https://www.python.org/downloads/ and try again.
pause
exit /b 1
:finished
pause
