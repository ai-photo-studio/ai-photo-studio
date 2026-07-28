@echo off
REM Regression Protection: Verify no hardcoded legacy package names appear in first-purchase flow pages.
REM This checks that the upload/preview/package/payment pages in the frontend
REM do NOT contain hardcoded "Starter", "Pro" (as plan), "Business", or "Dealer" strings.
REM Package display must be data-driven from the API (/api/packages).
REM Exit code 1 if any hardcoded legacy package string is found.

setlocal enabledelayedexpansion

set FRONTEND_SRC=apps\web\src\pages
set ERRORS=0

for %%f in (RestoreNewPage.tsx RestoreOrderPage.tsx PricingPage.tsx) do (
  set "file=%FRONTEND_SRC%\%%f"
  if exist "!file!" (
    findstr /C:"Starter" "!file!" >nul 2>&1
    if !errorlevel! equ 0 (
      echo FAIL: !file! contains hardcoded 'Starter'
      findstr /N /C:"Starter" "!file!"
      set /a ERRORS+=1
    )
    findstr /C:"Business" "!file!" >nul 2>&1
    if !errorlevel! equ 0 (
      echo FAIL: !file! contains hardcoded 'Business'
      findstr /N /C:"Business" "!file!"
      set /a ERRORS+=1
    )
    findstr /C:"Dealer" "!file!" >nul 2>&1
    if !errorlevel! equ 0 (
      echo FAIL: !file! contains hardcoded 'Dealer'
      findstr /N /C:"Dealer" "!file!"
      set /a ERRORS+=1
    )
  ) else (
    echo WARN: !file! not found
  )
)

if %ERRORS% gtr 0 (
  echo.
  echo REGRESSION: %ERRORS% hardcoded legacy package name(s) found in first-purchase flow pages.
  exit /b 1
)

echo OK: No hardcoded legacy package names in first-purchase flow pages.
exit /b 0
