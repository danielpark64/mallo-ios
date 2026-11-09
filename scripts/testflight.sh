#!/bin/zsh
# 세이람 TestFlight 올리기 — Xcode 로그인 없이 App Store Connect 관리자 API 키로 서명·업로드한다.
# 사용: scripts/testflight.sh          지금 ios/ 프로젝트의 버전·빌드 번호 그대로 아카이브 → 업로드
#       scripts/testflight.sh check    올리지 않고 서명까지만 시험
# 빌드 번호는 app.json(ios.buildNumber)에서 올린 뒤 `npx expo prebuild -p ios --clean`으로 ios/에 반영한다(ios/는 커밋 안 함).
# 키: ~/.appstoreconnect/upload-key(KEY_ID·ISSUER), ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8 — 꼭 '관리자' 키
# 견본: ~/Desktop/daniel-project/Albummory/scripts/testflight.sh
set -e -o pipefail
MODE=${1:-upload}
cd "$(dirname "$0")/.."
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
PLIST=ios/SayRam/Info.plist
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

BUILD=$(/usr/libexec/PlistBuddy -c 'Print CFBundleVersion' $PLIST)
VERSION=$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' $PLIST)
echo "▶ 세이람 $VERSION ($BUILD) — $MODE"

source ~/.appstoreconnect/upload-key
AUTH=(-allowProvisioningUpdates -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_$KEY_ID.p8 -authenticationKeyID $KEY_ID -authenticationKeyIssuerID $ISSUER)

# 산출물은 iCloud 바탕화면 밖에. 아카이브는 임시 서명(-)만 — 새 위젯 타깃의 개발용 프로파일을 키로 못 만들어서(2026-11-08)
# 진짜 배포 서명은 아래 내보내기(클라우드 서명, 관리자 키)가 한다
ARCHIVE=~/Library/Developer/Xcode/Archives/SayRam-$VERSION-$BUILD.xcarchive
rm -rf $ARCHIVE
xcodebuild -workspace ios/SayRam.xcworkspace -scheme SayRam -configuration Release \
  -destination 'generic/platform=iOS' -archivePath $ARCHIVE \
  -derivedDataPath ~/Library/Developer/Xcode/DerivedData/sayram-device \
  CODE_SIGNING_ALLOWED=NO \
  archive > $WORK/archive.log 2>&1 \
  || { grep -E "error:" $WORK/archive.log | head -20; echo "✗ 아카이브 실패"; exit 1; }
# 서명 없이 만든 앱에 권한(entitlements, App Group 등)만 임시 서명(-)으로 붙인다 — 내보내기가 이 권한을 보고 배포 서명한다
APP=$ARCHIVE/Products/Applications/SayRam.app
APPEX=$APP/PlugIns/SayramWidget.appex
for f in $APP/Frameworks/*(N); do codesign -f -s - $f; done
codesign -f -s - --entitlements ios/.targets/SayramWidget/generated.entitlements $APPEX
sed 's/<string>development<\/string>/<string>production<\/string>/' ios/SayRam/SayRam.entitlements > $WORK/app.entitlements
codesign -f -s - --entitlements $WORK/app.entitlements $APP
echo "▶ 아카이브 완료"

DEST=$([[ $MODE == check ]] && echo export || echo upload)
cat > $WORK/ExportOptions.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>destination</key><string>$DEST</string>
<key>teamID</key><string>T5Z6ACK2PU</string>
<key>signingStyle</key><string>automatic</string>
<key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
EOF
xcodebuild -exportArchive -archivePath $ARCHIVE -exportOptionsPlist $WORK/ExportOptions.plist \
  -exportPath $WORK/out $AUTH > $WORK/export.log 2>&1 \
  || { grep -E "error:" $WORK/export.log | head -10; echo "✗ 내보내기 실패"; exit 1; }
if [[ $MODE == check ]]; then echo "✓ 서명 시험 통과 ($VERSION/$BUILD, 올리지 않음)"
else echo "✓ TestFlight 업로드 완료 ($VERSION/$BUILD) — 처리에 10~30분"; fi
