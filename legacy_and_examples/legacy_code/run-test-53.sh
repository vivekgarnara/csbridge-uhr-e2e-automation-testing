#!/bin/bash

# Run A02 Test Case 53 (a02-53)
# Test: Verify empty transfer location prevents submission

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         Running Test Case a02-53                              ║"
echo "║  'Verify empty transfer location prevents submission'         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if in correct directory
if [ ! -f "package.json" ]; then
    echo "Error: package.json not found!"
    echo "Please run this script from the project root directory:"
    echo "cd D:\\csbridge-uhr-e2e-automation-testing\\csbridge-uhr-e2e-automation-testing"
    exit 1
fi

echo "📋 Test Details:"
echo "  Test ID: a02-53"
echo "  Category: NEGATIVE (tests rejection)"
echo "  Expected: Empty transfer location prevents A02 submission"
echo ""

# Option to run with or without browser
echo "Choose run mode:"
echo "  1) Run silently (headless)"
echo "  2) Run with browser visible (headed)"
echo "  3) Debug mode (interactive)"
echo "  4) All A02 tests"
echo ""
read -p "Enter choice (1-4): " choice

case $choice in
    1)
        echo ""
        echo "🚀 Running test silently..."
        npx playwright test tests/specs/A02/A02.spec.js -g "a02-53"
        ;;
    2)
        echo ""
        echo "🚀 Running test with browser visible..."
        npx playwright test tests/specs/A02/A02.spec.js -g "a02-53" --headed
        ;;
    3)
        echo ""
        echo "🚀 Running test in debug mode..."
        echo "   (Playwright Inspector will open)"
        npx playwright test tests/specs/A02/A02.spec.js -g "a02-53" --debug
        ;;
    4)
        echo ""
        echo "🚀 Running all A02 tests..."
        npm run test:a02
        ;;
    *)
        echo "Invalid choice!"
        exit 1
        ;;
esac

echo ""
echo "Test execution complete!"
echo ""
echo "To view detailed HTML report, run:"
echo "  npm run report"
echo ""
