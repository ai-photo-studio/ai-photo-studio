@echo off
REM Enterprise Safe Deploy Script
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