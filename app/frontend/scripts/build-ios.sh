#!/usr/bin/env bash
# macOS + Xcode 26+, Apple Development Team and distribution signing required.
# Builds locally; no uploads are performed.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(uname -s)" == Darwin ]] || { echo 'iOS archive requires macOS / Xcode; use the iOS Release GitHub workflow.'; exit 1; }
: "${APPLE_TEAM_ID:?Set APPLE_TEAM_ID after registering with Apple Developer}"
: "${BUILD_NUMBER:?Set BUILD_NUMBER to an unused positive integer}"
[[ "$BUILD_NUMBER" =~ ^[1-9][0-9]{0,8}$ ]] || { echo 'Invalid BUILD_NUMBER'; exit 1; }
XCODE_MAJOR=$(xcodebuild -version | awk '/Xcode/{split($2,v,".");print v[1]}')
[[ "$XCODE_MAJOR" -ge 26 ]] || { echo 'App Store requires Xcode 26 or later.'; exit 1; }
node scripts/build-store-web.mjs ios
EXPORT_DIR="$PWD/releases/ios/$BUILD_NUMBER"
mkdir -p "$EXPORT_DIR"
ARCHIVE_PATH="$EXPORT_DIR/App.xcarchive"
EXPORT_PLIST="$EXPORT_DIR/ExportOptions.plist"
cp ios/ExportOptions.plist "$EXPORT_PLIST"
/usr/libexec/PlistBuddy -c "Set :teamID $APPLE_TEAM_ID" "$EXPORT_PLIST"
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release \
  -archivePath "$ARCHIVE_PATH" -destination 'generic/platform=iOS' \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  -allowProvisioningUpdates archive
xcodebuild -exportArchive -archivePath "$ARCHIVE_PATH" \
  -exportOptionsPlist "$EXPORT_PLIST" -exportPath "$EXPORT_DIR" -allowProvisioningUpdates
echo "IPA export directory: $EXPORT_DIR"
