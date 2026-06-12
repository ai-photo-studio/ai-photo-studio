@echo off
REM Safe Git Push Script
REM Runs project verification before pushing

node scripts\verify-project.js
if %ERRORLEVEL% neq 0 (
    echo.
    echo PUSH BLOCKED: Project verification failed
    exit /b 1
)

echo.
echo Project verified. Proceeding with push...
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