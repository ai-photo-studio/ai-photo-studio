@echo off
REM Enterprise Safe Git Push Script
REM Runs full verification before pushing

echo ========================================
echo ENTERPRISE SAFETY CHECK
echo ========================================
echo.

node scripts/verify-project.js
if %ERRORLEVEL% neq 0 (
    echo.
    echo PUSH BLOCKED: Project verification failed
    exit /b 1
)

echo.
echo Running build verification...
npm run build
if %ERRORLEVEL% neq 0 (
    echo.
    echo PUSH BLOCKED: Build verification failed
    exit /b 1
)

echo.
echo Running typecheck verification...
npm run typecheck
if %ERRORLEVEL% neq 0 (
    echo.
    echo PUSH BLOCKED: Typecheck verification failed
    exit /b 1
)

echo.
echo ========================================
echo ALL VERIFICATIONS PASSED
echo ========================================
echo.

git status
echo.

git add .
echo.

git commit
if %ERRORLEVEL% neq 0 (
    echo No changes to commit.
)

git push origin main