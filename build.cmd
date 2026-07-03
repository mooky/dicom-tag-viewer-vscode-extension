@echo off
REM Builds the .vsix using the dev container, from a Windows cmd.exe prompt.
REM Silent/non-interactive: safe to run unattended in a CI/CD pipeline.
REM Requires Docker Desktop running and the devcontainer CLI (npm install -g @devcontainers/cli).

setlocal

call devcontainer up --workspace-folder "%~dp0."
if errorlevel 1 (
    endlocal
    exit /b 1
)

call devcontainer exec --workspace-folder "%~dp0." npm run package:vsix --silent
if errorlevel 1 (
    endlocal
    exit /b 1
)

endlocal
exit /b 0
