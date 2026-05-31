#!/bin/bash
# Build joemail-frontend image
# Docker inherits parent .dockerignore, so we copy to temp dir first

set -e

BUILD_DIR="/tmp/joemail-frontend-build"
SOURCE_DIR="/opt/joemail/frontend"

# Clean and copy
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cp -r "$SOURCE_DIR"/* "$BUILD_DIR/"
cp "$SOURCE_DIR"/.dockerignore "$BUILD_DIR/" 2>/dev/null || true

# Build
cd "$BUILD_DIR"
docker build --no-cache -t joemail-frontend:latest .

# Cleanup
rm -rf "$BUILD_DIR"

echo "Done! joemail-frontend:latest built successfully."
