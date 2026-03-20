#!/bin/bash

echo "Checking devcontainer services..."
echo "================================="

if [ -n "$CODESPACE_NAME" ]; then
    echo "Running in GitHub Codespaces"
    echo "Codespace: $CODESPACE_NAME"
elif [ -n "$REMOTE_CONTAINERS" ]; then
    echo "Running in VS Code Remote Containers"
else
    echo "Warning: devcontainer environment not detected"
fi

echo ""
echo "Checking service connectivity..."
echo "---------------------------------"

# PostgreSQL
if ping -c 1 db >/dev/null 2>&1; then
    echo "PostgreSQL (db): Reachable"
    if nc -z db 5432 2>/dev/null; then
        echo "PostgreSQL port 5432: Open"
    else
        echo "PostgreSQL port 5432: Closed"
    fi
else
    echo "PostgreSQL (db): Unreachable"
fi

# Typesense
if ping -c 1 typesense >/dev/null 2>&1; then
    echo "Typesense: Reachable"
    if nc -z typesense 8108 2>/dev/null; then
        echo "Typesense port 8108: Open"
    else
        echo "Typesense port 8108: Closed"
    fi
else
    echo "Typesense: Unreachable"
fi

echo ""
echo "System info..."
echo "--------------"
echo "Docker available: $(which docker >/dev/null && echo "Yes" || echo "No")"
echo "Node version: $(node --version 2>/dev/null || echo "Not found")"
echo "pnpm version: $(pnpm --version 2>/dev/null || echo "Not found")"

echo ""
echo "Open ports..."
echo "-------------"
netstat -tuln 2>/dev/null | grep -E ":3000|:5432|:8108" || echo "No service ports found open yet"

echo ""
echo "To rebuild the devcontainer:"
echo "  Ctrl+Shift+P -> 'Codespaces: Rebuild Container'"
echo "  Or use 'Rebuild and Reopen in Container' from VS Code"
