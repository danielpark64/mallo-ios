#!/bin/bash
# App Store 스크린샷(B안 손글씨, 1·2번 이어진 한 장) 9개 언어 아이폰·아이패드를 다시 뽑는다.
# 사용: bash tools/store-shot-appstore.sh [언어...]   (언어를 비우면 9개 전부)
# 원본 캡처: store-assets/appstore-copy/_src-ios/<lang>/ (아이폰 17 Pro 시뮬레이터, ko 는 _src-ios/ 바로 아래)
#            store-assets/appstore-copy/_src-ipad/<lang>/ (아이패드 Pro 13 시뮬레이터)
# 아이패드 04 위젯 장면은 아이폰 위젯 캡처(크게 위젯)를 잘라 쓴다(아이패드 홈에 위젯을 올리지 못했다).
# 결과: store-assets/appstore-final/iphone/<lang>/ (1206x2622), store-assets/appstore-final/ipad/<lang>/ (2064x2752)
cd "$(dirname "$0")/.."
A=store-assets/appstore-copy
OUT=store-assets/appstore-final
BOX=0,215,1206,1385
LANGS=${*:-ko en ja zh-Hans zh-Hant es fr de pt}
one() {
  l=$1
  common="--style bold --font-variant H --pano-merged --lang $l"
  if [ "$l" = ko ]; then
    python3 tools/store-shot.py $common --platform ios --size 1206x2622 --out $OUT/iphone/$l > /dev/null || echo "실패 iphone $l"
    W=$A/_src-ios/04_widget_home.png
  else
    python3 tools/store-shot.py $common --platform ios --size 1206x2622 --src-dir $A/_src-ios/$l --widget-box $BOX --out $OUT/iphone/$l > /dev/null || echo "실패 iphone $l"
    W=$A/_src-ios/$l/04_widget_home.png
  fi
  python3 tools/store-shot.py $common --platform ipad --size 2064x2752 --src-dir $A/_src-ipad/$l --widget-src $W --widget-box $BOX --out $OUT/ipad/$l > /dev/null || echo "실패 ipad $l"
  echo "끝: $l"
}
export -f one; export A OUT BOX
printf "%s\n" $LANGS | xargs -P 4 -I{} bash -c 'one {}'
