@echo off
REM Project Info Script
REM Displays project identity information

for /f "delims=" %%i in ('node -e "const fs=require('fs');const lock=JSON.parse(fs.readFileSync('PROJECT_LOCK.json'));console.log(JSON.stringify(lock))"') do set LOCK=%%i

echo.
echo ========================================
echo PROJECT IDENTITY
echo ========================================
echo.

for /f "tokens=*" %%a in ('node -e "const fs=require('fs');const lock=JSON.parse(fs.readFileSync('PROJECT_LOCK.json'));console.log('Project Name:', lock.projectName);console.log('GitHub Repo:', lock.expectedGitHubRepositoryUrl);console.log('Branch:', lock.expectedBranch);console.log('Railway Project:', lock.expectedRailwayProjectName);console.log('Railway Environment:', lock.expectedRailwayEnvironment);console.log('Railway Service:', lock.expectedRailwayService);"') do echo %%a

echo.
echo ========================================
echo DEPLOYMENT URL
echo ========================================
echo.

for /f "delims=" %%u in ('railway status 2^>nul ^| findstr /C:"url:"') do echo %%u

echo.

for /f "delims=" %%u in ('railway status 2^>nul ^| findstr /C:"https://"') do echo Deployment: %%u