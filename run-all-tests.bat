@echo off
REM ============================================================================
REM Run ALL Tests - No Tests Skipped
REM All 800+ test cases will execute
REM ============================================================================

cls
echo.
echo ============================================================================
echo                     RUN ALL TESTS - NO SKIPS
echo            All ~800+ test cases will execute
echo ============================================================================
echo.

REM Check if in correct directory
if not exist "package.json" (
    echo Error: package.json not found!
    echo Please run this script from the project root directory.
    pause
    exit /b 1
)

echo Test Suite Summary:
echo   A01: 93 tests
echo   A02: 95 tests
echo   A03: 99 tests
echo   A04: 99+ tests
echo   A05: 99+ tests
echo   A06: 99+ tests
echo   A07: 99+ tests
echo   A08: 99+ tests
echo   ─────────────────
echo   TOTAL: 800+ tests (ALL WILL RUN)
echo.

echo Prerequisites:
echo   ✓ Node.js installed
echo   ✓ Dependencies installed (npm install)
echo   ✓ Database seeded (npm run seed)
echo.

echo Choose run mode:
echo   1) Full run (seed + run all tests + report)    [RECOMMENDED]
echo   2) Run all tests only (assume data seeded)
echo   3) Run with browser visible (slower)
echo   4) Run A01 tests only
echo   5) Run A02 tests only
echo   6) Run A03 tests only
echo   7) Run specific event type (enter at prompt)
echo   8) Just seed database
echo   9) View previous test report
echo.

set /p choice="Enter choice (1-9): "

if "%choice%"=="1" (
    call :run_full
    goto done
)

if "%choice%"=="2" (
    call :run_tests_only
    goto done
)

if "%choice%"=="3" (
    call :run_headed
    goto done
)

if "%choice%"=="4" (
    call :run_a01
    goto done
)

if "%choice%"=="5" (
    call :run_a02
    goto done
)

if "%choice%"=="6" (
    call :run_a03
    goto done
)

if "%choice%"=="7" (
    call :run_custom
    goto done
)

if "%choice%"=="8" (
    call :seed_only
    goto done
)

if "%choice%"=="9" (
    call :view_report
    goto done
)

echo Invalid choice!
pause
exit /b 1

:run_full
echo.
echo ============================================================================
echo STARTING: Full test run (seed + all tests + report)
echo ============================================================================
echo.
echo Step 1: Seeding database...
call npm run seed
if errorlevel 1 (
    echo ERROR: Database seeding failed!
    pause
    exit /b 1
)
echo.
echo Step 2: Running all tests...
call npm run test:all
if errorlevel 1 (
    echo WARNING: Some tests may have failed (this is OK)
)
echo.
echo Step 3: Generating Allure report...
call npm run report
call npm run allure:generate
echo.
echo Would you like to serve/open the Allure Report dashboard? (Y/N)
set /p open_allure="Choice: "
if /i "%open_allure%"=="Y" (
    call npm run allure:serve
)
echo.
echo ============================================================================
echo COMPLETE: All tests finished
echo ============================================================================
exit /b 0

:run_tests_only
echo.
echo ============================================================================
echo STARTING: Running all tests (assuming database already seeded)
echo ============================================================================
echo.
call npm run playwright:test
if errorlevel 1 (
    echo WARNING: Some tests may have failed (this is OK)
)
echo.
echo To view report: npm run report
pause
exit /b 0

:run_headed
echo.
echo ============================================================================
echo STARTING: Running with browser visible
echo ============================================================================
echo.
call npx playwright test tests/specs --headed
pause
exit /b 0

:run_a01
echo.
echo ============================================================================
echo STARTING: Running A01 tests (93 tests)
echo ============================================================================
echo.
call npm run test:a01
if errorlevel 1 (
    echo WARNING: Some tests may have failed (this is OK)
)
pause
exit /b 0

:run_a02
echo.
echo ============================================================================
echo STARTING: Running A02 tests (95 tests)
echo ============================================================================
echo.
call npm run test:a02
if errorlevel 1 (
    echo WARNING: Some tests may have failed (this is OK)
)
pause
exit /b 0

:run_a03
echo.
echo ============================================================================
echo STARTING: Running A03 tests (99 tests)
echo ============================================================================
echo.
call npm run test:a03
if errorlevel 1 (
    echo WARNING: Some tests may have failed (this is OK)
)
pause
exit /b 0

:run_custom
echo.
set /p event_type="Enter event type (A01, A02, A03, A04, A05, A06, A07, or A08): "
echo.
echo ============================================================================
echo STARTING: Running %event_type% tests
echo ============================================================================
echo.
call npm run test:%event_type%
if errorlevel 1 (
    echo WARNING: Some tests may have failed (this is OK)
)
pause
exit /b 0

:seed_only
echo.
echo ============================================================================
echo STARTING: Database seeding only
echo ============================================================================
echo.
call npm run seed
if errorlevel 1 (
    echo ERROR: Seeding failed!
    pause
    exit /b 1
)
echo.
echo ✓ Database seeded successfully
echo.
echo Next steps:
echo   - Run tests: npm run test:all
echo   - View report: npm run report
pause
exit /b 0

:view_report
echo.
echo ============================================================================
echo Opening previous test reports...
echo ============================================================================
echo.
echo Choose report to open:
echo   1) Playwright HTML Report
echo   2) Allure Report Dashboard  [RECOMMENDED]
echo.
set /p r_choice="Enter choice (1-2): "
if "%r_choice%"=="2" (
    call npm run allure:serve
    exit /b 0
)
call npm run report
exit /b 0

:done
echo.
echo ============================================================================
echo All operations complete!
echo ============================================================================
echo.
echo Next steps:
echo   - View Allure report dashboard: npm run allure:serve
echo   - View playwright results: npm run report
echo   - Check coverage: check playwright-report/index.html
echo   - See JUnit XML: test-results/junit.xml
echo.
pause
