@echo off
REM Safe Deploy Script
REM Verifies project and Railway before deploying

node scripts\verify-project.js
if %ERRORLEVEL% neq 0 (
    echo.
    echo DEPLOY BLOCKED: Project verification failed
    exit /b 1
)

echo.
echo Project verified. Reading Railway status...
echo.

railway status
if %ERRORLEVEL% neq 0 (
    echo.
    echo DEPLOY BLOCKED: Railway status check failed
    exit /b 1
)

echo.
echo Safe to deploy. Pushing to Railway...
echo.

git push origin main
railway up