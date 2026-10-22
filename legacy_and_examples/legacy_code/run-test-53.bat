@echo off
REM ============================================================================
REM Run A02 Test Case 53 (a02-53)
REM Test: Verify empty transfer location prevents submission
REM ============================================================================

cls
echo.
echo ============================================================================
echo            Running Test Case a02-53
echo    'Verify empty transfer location prevents submission'
echo ============================================================================
echo.

REM Check if in correct directory
if not exist "package.json" (
    echo Error: package.json not found!
    echo Please run this script from the project root directory:
    echo D:\csbridge-uhr-e2e-automation-testing\csbridge-uhr-e2e-automation-testing
    pause
    exit /b 1
)

echo Test Details:
echo   Test ID: a02-53
echo   Category: NEGATIVE (tests rejection)
echo   Expected: Empty transfer location prevents A02 submission
echo.

echo Choose run mode:
echo   1) Run silently (headless)
echo   2) Run with browser visible (headed)
echo   3) Debug mode (interactive)
echo   4) All A02 tests
echo   5) View previous test report
echo.

set /p choice="Enter choice (1-5): "

if "%choice%"=="1" (
    echo.
    echo Running test silently...
    npx playwright test tests/specs/A02/A02.spec.js -g "a02-53"
    goto done
)

if "%choice%"=="2" (
    echo.
    echo Running test with browser visible...
    npx playwright test tests/specs/A02/A02.spec.js -g "a02-53" --headed
    goto done
)

if "%choice%"=="3" (
    echo.
    echo Running test in debug mode...
    echo (Playwright Inspector will open)
    npx playwright test tests/specs/A02/A02.spec.js -g "a02-53" --debug
    goto done
)

if "%choice%"=="4" (
    echo.
    echo Running all A02 tests...
    call npm run test:a02
    goto done
)

if "%choice%"=="5" (
    echo.
    echo Opening test report...
    call npm run report
    goto done
)

echo Invalid choice!
pause
exit /b 1

:done
echo.
echo ============================================================================
echo Test execution complete!
echo ============================================================================
echo.
echo Next steps:
echo   - View detailed HTML report:  npm run report
echo   - Run all A02 tests:          npm run test:a02
echo   - Run specific test again:    npx playwright test tests/specs/A02/A02.spec.js -g "a02-53"
echo.
pause
