#!/bin/zsh
# 세이람 TestFlight 올리기 — 말하는 사진첩(Albummory/scripts/testflight.sh)과 같은 방식.
# Xcode 로그인이 풀려 있어도 App Store Connect 관리자 API 키로 서명·업로드하고, 키로 실패하면 Xcode 로그인으로 한 번 더 시도한다.
# 사용: scripts/testflight.sh          빌드 번호 +1 → 아카이브 → 업로드
#       scripts/testflight.sh check    번호 그대로, 올리지 않고 서명까지만 시험(내보낸 ipa는 지움)
# 빌드 번호는 app.json(ios.buildNumber)·project.pbxproj·Info.plist 세 곳을 같이 올린다(ios/는 커밋 안 하지만 다음 prebuild도 같은 번호).
# 키: ~/.appstoreconnect/upload-key(KEY_ID·ISSUER), ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8 — 꼭 '관리자' 키
#   ('앱 관리' 키는 클라우드 배포 인증서를 못 써서 실패한다)
# 위젯(com.danielpark.sayram.widget)의 App Group(group.com.danielpark.shared)은 developer.apple.com에서 연결해 둠(2026-11-09).
#   API 키로는 App Group을 붙일 수 없어서, 새 확장 타깃을 만들면 그 연결은 웹에서 직접 해야 한다.
set -e -o pipefail
MODE=${1:-upload}
cd "$(dirname "$0")/.."
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
PLIST=ios/SayRam/Info.plist
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# 빌드 번호(app.json·project.pbxproj·Info.plist 세 곳을 같이) — 위젯 타깃도 같은 번호여야 업로드가 받아 준다.
# 기준은 **app.json**: ios/는 커밋하지 않는 생성 폴더라 expo prebuild 를 하면 Info.plist 번호가
# app.json 값으로 되돌아간다. Info.plist 를 기준으로 삼으면 되돌아간 번호에 +1 을 해서
# 이미 올린 번호를 다시 올리려다 거부당한다(2026-11-14).
BUILD=$(grep -o '"buildNumber": *"[0-9]*"' app.json | grep -o '[0-9]*')
[[ -z $BUILD ]] && BUILD=$(/usr/libexec/PlistBuddy -c 'Print CFBundleVersion' $PLIST)
if [[ $MODE != check ]]; then
  BUILD=$((BUILD + 1))
  sed -i '' -E "s/(\"buildNumber\": \")[0-9]+\"/\1$BUILD\"/" app.json
  sed -i '' -E "s/CURRENT_PROJECT_VERSION = [0-9]+;/CURRENT_PROJECT_VERSION = $BUILD;/" ios/SayRam.xcodeproj/project.pbxproj
  /usr/libexec/PlistBuddy -c "Set CFBundleVersion $BUILD" $PLIST
fi
VERSION=$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' $PLIST)
echo "▶ 세이람 $VERSION ($BUILD) — $MODE"

# API 키
AUTH=()
if [[ -f ~/.appstoreconnect/upload-key ]]; then
  source ~/.appstoreconnect/upload-key
  KEYFILE=~/.appstoreconnect/private_keys/AuthKey_$KEY_ID.p8
  if [[ -f $KEYFILE ]]; then
    AUTH=(-authenticationKeyPath $KEYFILE -authenticationKeyID $KEY_ID -authenticationKeyIssuerID $ISSUER)
    echo "▶ API 키 $KEY_ID 사용"
  fi
fi
[[ ${#AUTH} -eq 0 ]] && echo "▶ API 키 없음 — Xcode 로그인으로"

# 아카이브(산출물은 iCloud 바탕화면 밖에). 키로 실패하면 Xcode 로그인으로 한 번 더
ARCHIVE=~/Library/Developer/Xcode/Archives/SayRam-$VERSION-$BUILD.xcarchive
archive_with() {
  rm -rf $ARCHIVE
  xcodebuild -workspace ios/SayRam.xcworkspace -scheme SayRam -configuration Release \
    -destination 'generic/platform=iOS' -archivePath $ARCHIVE \
    -derivedDataPath ~/Library/Developer/Xcode/DerivedData/sayram-device \
    -allowProvisioningUpdates "$@" archive > $WORK/archive.log 2>&1
}
if archive_with $AUTH; then
  :
elif [[ ${#AUTH} -gt 0 ]] && { grep -E "error:" $WORK/archive.log | head -4; echo "▶ 키로 실패 — Xcode 로그인으로 다시"; archive_with; }; then
  :
else
  grep -E "error:|The following build commands failed" -A2 $WORK/archive.log | head -20
  echo "✗ 아카이브 실패"
  exit 1
fi
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

export_with() {
  xcodebuild -exportArchive -archivePath $ARCHIVE -exportOptionsPlist $WORK/ExportOptions.plist \
    -exportPath $WORK/out -allowProvisioningUpdates "$@" > $WORK/export.log 2>&1
}
if export_with $AUTH; then
  :
elif [[ ${#AUTH} -gt 0 ]] && { grep -E "error:" $WORK/export.log | head -4; echo "▶ 키로 실패 — Xcode 로그인으로 다시"; export_with; }; then
  :
else
  grep -E "error:" $WORK/export.log | head -10
  echo "✗ 내보내기 실패 — Xcode 로그인 또는 관리자 API 키가 필요해요"
  exit 1
fi
if [[ $MODE == check ]]; then
  echo "✓ 서명 시험 통과 ($VERSION/$BUILD, 올리지 않음)"
else
  echo "✓ TestFlight 업로드 완료 ($VERSION/$BUILD) — 처리에 10~30분"
fi
