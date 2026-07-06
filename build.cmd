@echo off
REM Builds the .vsix natively, from a Windows cmd.exe prompt.
REM Silent/non-interactive: safe to run unattended in a CI/CD pipeline.
REM Requires Node.js/npm on PATH.

setlocal

call npm install
if errorlevel 1 (
    endlocal
    exit /b 1
)

call npm run package:vsix --silent
if errorlevel 1 (
    endlocal
    exit /b 1
)

endlocal
exit /b 0
