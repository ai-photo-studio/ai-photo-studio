@echo off
REM RETIRED -- historical reference only; not an active deploy or rollback target.
REM Current production API deployment target is Northflank (api.thannow.com), auto-deployed
REM via .github/workflows/deploy.yml on push to main. Railway is retired and this script is
REM blocked below to prevent an accidental deploy to the retired target.
echo RETIRED: This script targets Railway, which is no longer the production deployment target.
echo Current production target is Northflank (api.thannow.com) via .github/workflows/deploy.yml.
echo Blocking execution.
exit /b 1

REM Enterprise Safe Deploy Script (historical, Railway-era)
REM Runs full verification before deploying

echo ========================================
echo ENTERPRISE SAFETY CHECK
echo ========================================
echo.

node scripts/verify-project.js
if %ERRORLEVEL% neq 0 (
    echo.
    echo DEPLOY BLOCKED: Project verification failed
    exit /b 1
)

echo.
echo Running build verification...
npm run build
if %ERRORLEVEL% neq 0 (
    echo.
    echo DEPLOY BLOCKED: Build verification failed
    exit /b 1
)

echo.
echo Running typecheck verification...
npm run typecheck
if %ERRORLEVEL% neq 0 (
    echo.
    echo DEPLOY BLOCKED: Typecheck verification failed
    exit /b 1
)

echo.
echo ========================================
echo Railway Status
echo ========================================
echo.

railway status
if %ERRORLEVEL% neq 0 (
    echo.
    echo DEPLOY BLOCKED: Railway status check failed
    exit /b 1
)

echo.
echo ========================================
echo ALL VERIFICATIONS PASSED
echo ========================================
echo.

git push origin main
railway up