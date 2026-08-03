@echo off
REM RETIRED -- historical reference only; not an active deploy or rollback target.
REM Current production API deployment target is Northflank (api.thannow.com), auto-deployed
REM via .github/workflows/deploy.yml on push to main. Railway is retired and this script is
REM blocked below to prevent an accidental deploy to the retired target.
echo RETIRED: This script targets Railway, which is no longer the production deployment target.
echo Current production target is Northflank (api.thannow.com) via .github/workflows/deploy.yml.
echo Blocking execution.
exit /b 1

REM Safe Deploy Script (historical, Railway-era)
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