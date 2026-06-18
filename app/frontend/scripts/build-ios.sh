#!/usr/bin/env bash
# Build a signed Sortirovka24 IPA for the App Store / TestFlight.
# Run on macOS with Xcode + CocoaPods installed.
#
# Usage:
#   APPLE_TEAM_ID=XXXXXXXXXX ./scripts/build-ios.sh
#
# Optional env:
#   API_BASE_URL   backend URL (default: Railway production)
#   BUILD_NUMBER   CFBundleVersion (default: timestamp)
#   UPLOAD=1       also upload to TestFlight (needs ASC API key env, see below)
#     ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH (path to AuthKey_XXXX.p8)
set -euo pipefail

cd "$(dirname "$0")/.."  # app/frontend

API_BASE_URL="${API_BASE_URL:-https://sortirovka24-production-8788.up.railway.app}"
BUILD_NUMBER="${BUILD_NUMBER:-$(date +%s)}"
: "${APPLE_TEAM_ID:?Set APPLE_TEAM_ID to your 10-char Apple Developer Team ID}"

EXPORT_DIR="$(pwd)/releases/ios"
ARCHIVE_PATH="$EXPORT_DIR/App.xcarchive"
mkdir -p "$EXPORT_DIR"

echo "==> Building bundled web assets (App Store mode)"
printf 'VITE_API_BASE_URL=%s\n' "$API_BASE_URL" > .env.mobile
npm run build:mobile
npx cap sync ios

echo "==> Installing CocoaPods"
( cd ios/App && pod install )

echo "==> Setting team in ExportOptions.plist"
/usr/libexec/PlistBuddy -c "Set :teamID $APPLE_TEAM_ID" ios/ExportOptions.plist 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Add :teamID string $APPLE_TEAM_ID" ios/ExportOptions.plist

AUTH_ARGS=()
if [ "${UPLOAD:-0}" = "1" ]; then
  : "${ASC_KEY_ID:?Set ASC_KEY_ID}" "${ASC_ISSUER_ID:?Set ASC_ISSUER_ID}" "${ASC_KEY_PATH:?Set ASC_KEY_PATH}"
  AUTH_ARGS=(-authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
fi

echo "==> Archiving (build $BUILD_NUMBER)"
( cd ios/App && xcodebuild -workspace App.xcworkspace -scheme App -configuration Release \
    -archivePath "$ARCHIVE_PATH" -destination 'generic/platform=iOS' \
    -allowProvisioningUpdates \
    CURRENT_PROJECT_VERSION="$BUILD_NUMBER" DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
    "${AUTH_ARGS[@]}" clean archive )

echo "==> Exporting IPA"
( cd ios/App && xcodebuild -exportArchive -archivePath "$ARCHIVE_PATH" \
    -exportOptionsPlist ios/ExportOptions.plist 2>/dev/null \
    -exportPath "$EXPORT_DIR" -allowProvisioningUpdates "${AUTH_ARGS[@]}" || \
  xcodebuild -exportArchive -archivePath "$ARCHIVE_PATH" \
    -exportOptionsPlist "$(pwd)/ios/ExportOptions.plist" \
    -exportPath "$EXPORT_DIR" -allowProvisioningUpdates "${AUTH_ARGS[@]}" )

IPA=$(ls "$EXPORT_DIR"/*.ipa | head -n1)
echo "==> IPA ready: $IPA"

if [ "${UPLOAD:-0}" = "1" ]; then
  echo "==> Uploading to TestFlight"
  xcrun altool --upload-app -f "$IPA" -t ios --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
  echo "==> Uploaded. Check App Store Connect → TestFlight in a few minutes."
fi
