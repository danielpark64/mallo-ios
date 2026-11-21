#!/usr/bin/env python3
"""스토어 캡처용 언어별 시연 일정(백업 폴더 형식)을 만든다.

사용 예:
  python3 tools/store-demo-records.py --out /tmp/demo        # 8개 언어 전부
  python3 tools/store-demo-records.py --out /tmp/demo --lang en

결과: <out>/<lang>/records.json (+ 녹음 m4a 2개). 앱 설정 › 백업 › "폴더에서 가져오기"로 그 폴더를 고르면 들어간다.
- 날짜는 한국어 시연 자료와 같다(2026-11-21 기준 3일 뒤 11/24 …, 위젯 장면용 12/22~1/7).
- 내용은 그 나라에 자연스러운 일정으로 바꿨다(한국식 내용·한글 없음, 음력·공휴일·근무표 없음).
- 시간 있는 일정의 알람은 모두 진동(alarmMode 'vibe').
- 2번 장(녹음 상세)용 '저녁 식사' 일정만 녹음이 있다: 맥 say(그 언어 목소리)로 만든 m4a.
  단어 칩은 앱이 글을 띄어쓰기로 나눠 시간을 고르게 나눈다(lib/wordRange.ts chipsForEntry).
  띄어쓰기가 없는 일본어·중국어는 구절 경계만 segments(시각 0)로 넘겨 앱이 시간을 나누게 한다.
"""
import argparse, json, os, subprocess, tempfile
from datetime import datetime

LANGS = ["en", "ja", "zh-Hans", "zh-Hant", "es", "fr", "de", "pt"]
VOICE = {"en": "Samantha", "ja": "Kyoko", "zh-Hans": "Tingting", "zh-Hant": "Meijia",
         "es": "Mónica", "fr": "Thomas", "de": "Anna", "pt": "Luciana"}


def ms(y, mo, d, h=0, mi=0):
    return int(datetime(y, mo, d, h, mi).timestamp() * 1000)


# (id, 시작, 시간 있음, 미리 알림, 그 밖)
BASE = [
    ("demo-1", (2026, 11, 24, 10, 30), True, [30], {}),
    ("demo-2", (2026, 11, 24), False, None, {"needsDate": True}),
    ("demo-3", (2026, 11, 24, 14, 0), True, [30], {}),
    ("demo-4", (2026, 11, 25, 19, 0), True, [60], {}),
    ("demo-5", (2026, 11, 26, 15, 0), True, [30], {}),
    ("demo-6", (2026, 11, 27, 9, 30), True, [60], {}),
    ("demo-7", (2026, 11, 28, 12, 30), True, [30], {}),
    ("demo-8", (2026, 11, 29, 12, 0), True, [60], {}),
    ("demo-9", (2026, 12, 3, 10, 0), True, [30], {}),
    ("demo-10", (2026, 12, 5), False, None, {"endAt": ms(2026, 12, 7)}),
    ("demo-x1", (2026, 12, 22, 9, 0), True, [30], {}),
    ("demo-x2", (2026, 12, 24, 18, 0), True, [60], {}),
    ("demo-x3", (2026, 12, 26, 11, 0), True, [30], {}),
    ("demo-x4", (2026, 12, 31, 20, 0), True, [60], {}),
    ("demo-x5", (2027, 1, 5, 10, 0), True, [30], {}),
    ("fix-0", (2027, 1, 7, 10, 0), True, [30], {}),
]

# 언어별 내용(BASE 순서) + 저녁 식사 녹음의 추가 항목
TEXT = {
    "en": ["Dentist appointment", "Buy milk and eggs", "Go to the bank", "Dinner with my sister's family",
           "Hair salon", "Mom's doctor appointment", "Lunch with a friend", "Family get-together", "Car service",
           "Family trip to the beach", "Book the year-end party venue", "Christmas Eve dinner", "Big house cleaning",
           "New Year's Eve with family", "Book train tickets", "Plan goals for the new year"],
    "ja": ["歯医者の予約", "牛乳と卵を買う", "銀行で手続き", "姉の家族と夕食", "美容院", "母の通院", "友達とランチ",
           "家族の集まり", "車の点検", "家族で海へ旅行", "忘年会の店を予約", "クリスマスイブのディナー", "大掃除",
           "家族で年越し", "新幹線の切符を予約", "新年の目標を立てる"],
    "zh-Hans": ["牙医预约", "买牛奶和鸡蛋", "去银行办事", "和姐姐一家吃晚饭", "理发", "陪妈妈去医院", "和朋友吃午饭",
                "家庭聚会", "汽车保养", "全家去海边旅行", "预订年会场地", "平安夜晚餐", "大扫除", "全家跨年",
                "抢春节火车票", "制定新年计划"],
    "zh-Hant": ["牙醫預約", "買牛奶和雞蛋", "去銀行辦事", "和姊姊一家吃晚餐", "剪頭髮", "陪媽媽去醫院", "和朋友吃午餐",
                "家庭聚會", "汽車保養", "全家去海邊旅行", "預訂尾牙餐廳", "平安夜晚餐", "大掃除", "全家跨年",
                "訂春節返鄉車票", "訂新年計畫"],
    "es": ["Cita con el dentista", "Comprar leche y huevos", "Ir al banco", "Cena con la familia de mi hermana",
           "Peluquería", "Médico con mamá", "Comida con una amiga", "Reunión familiar", "Revisión del coche",
           "Viaje familiar a la playa", "Reservar la cena de empresa", "Cena de Nochebuena", "Limpieza general",
           "Nochevieja en familia", "Comprar billetes de tren", "Planes para el año nuevo"],
    "fr": ["Rendez-vous chez le dentiste", "Acheter du lait et des œufs", "Passer à la banque", "Dîner chez ma sœur",
           "Coiffeur", "Médecin avec maman", "Déjeuner avec une amie", "Repas de famille", "Révision de la voiture",
           "Vacances en famille à la mer", "Réserver le resto de fin d'année", "Réveillon de Noël", "Grand ménage",
           "Réveillon du Nouvel An en famille", "Réserver les billets de train", "Bonnes résolutions"],
    "de": ["Zahnarzttermin", "Milch und Eier kaufen", "Zur Bank gehen", "Abendessen bei meiner Schwester", "Friseur",
           "Mit Mama zum Arzt", "Mittagessen mit einer Freundin", "Familientreffen", "Auto zur Inspektion",
           "Familienurlaub am Meer", "Weihnachtsfeier reservieren", "Essen an Heiligabend", "Großputz",
           "Silvester mit der Familie", "Zugtickets buchen", "Pläne fürs neue Jahr"],
    "pt": ["Consulta no dentista", "Comprar leite e ovos", "Ir ao banco", "Jantar com a família da minha irmã",
           "Cabeleireiro", "Médico com a mãe", "Almoço com uma amiga", "Encontro de família", "Revisão do carro",
           "Viagem em família para a praia", "Reservar a festa de fim de ano", "Ceia de Natal", "Faxina geral",
           "Réveillon em família", "Comprar passagens de trem", "Planos para o ano novo"],
}
APPEND = {
    "en": "I booked the Italian place next to the station",
    "ja": "お店は駅前のイタリアンを予約したよ",
    "zh-Hans": "餐厅订了车站旁边那家意大利餐厅",
    "zh-Hant": "餐廳訂了車站旁邊那家義大利餐廳",
    "es": "Reservé en el italiano al lado de la estación",
    "fr": "J'ai réservé l'italien à côté de la gare",
    "de": "Ich habe beim Italiener am Bahnhof reserviert",
    "pt": "Reservei no italiano ao lado da estação",
}
# 띄어쓰기 없는 언어: 구절 경계(시각은 0 → 앱이 녹음 길이에 맞춰 나눈다)
PHRASES = {
    "ja": (["姉の家族と", "夕食"], ["お店は", "駅前の", "イタリアンを", "予約したよ"]),
    "zh-Hans": (["和姐姐一家", "吃晚饭"], ["餐厅", "订了", "车站旁边", "那家", "意大利餐厅"]),
    "zh-Hant": (["和姊姊一家", "吃晚餐"], ["餐廳", "訂了", "車站旁邊", "那家", "義大利餐廳"]),
}
APP_DIR = "file:///data/user/0/com.danielpark.sayram/files/mallo/"


SILENT = False  # --silent: say 를 쓰지 않고 소리 없는 m4a(글 길이로 길이를 어림)를 만든다


def tts_m4a(text, voice, path):
    """맥 say → AAC m4a(앱 녹음과 같은 형식). 길이(초)를 돌려준다. SILENT 면 소리 없는 파일."""
    if SILENT:
        cjk = sum(1 for ch in text if ord(ch) > 0x2E80)
        dur = round(1.0 + cjk * 0.4 + (len(text) - cjk) * 0.12, 2)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
                        "-t", str(dur), "-c:a", "aac", "-b:a", "64k", path], check=True)
        return dur
    with tempfile.TemporaryDirectory() as td:
        aiff = os.path.join(td, "a.aiff")
        subprocess.run(["say", "-v", voice, "-o", aiff, text], check=True)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", aiff, "-ac", "1", "-ar", "44100",
                        "-c:a", "aac", "-b:a", "64k", path], check=True)
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True, check=True).stdout.strip()
    return float(out)


def segs(parts):
    return [{"segment": p, "startTimeMillis": 0, "endTimeMillis": 0} for p in parts]


def build(lang, out):
    d = os.path.join(out, lang)
    os.makedirs(d, exist_ok=True)
    recs = []
    created = ms(2026, 11, 20, 9, 0)
    for i, ((rid, when, has_time, remind, extra), text) in enumerate(zip(BASE, TEXT[lang])):
        r = {"id": rid, "uri": "", "durationSec": 0, "transcript": text, "content": text,
             "scheduleAt": ms(*when), "scheduleDisplay": "", "hasDate": True, "hasTime": has_time,
             "alarmMode": "vibe", "createdAt": created + i * 1000}
        if remind:
            r["remindBefore"] = remind
        r.update(extra)
        if rid == "demo-4":  # 2번 장: 녹음 있는 일정 + 녹음 있는 추가 항목
            main_name, app_name = "store-%s-main.m4a" % lang, "store-%s-append.m4a" % lang
            r["uri"] = APP_DIR + main_name
            r["durationSec"] = round(tts_m4a(text, VOICE[lang], os.path.join(d, main_name)), 2)
            a = {"id": "demo-4-a1", "uri": APP_DIR + app_name, "transcript": APPEND[lang], "content": APPEND[lang],
                 "durationSec": round(tts_m4a(APPEND[lang], VOICE[lang], os.path.join(d, app_name)), 2),
                 "createdAt": ms(2026, 11, 20, 15, 0)}
            if lang in PHRASES:
                r["segments"] = segs(PHRASES[lang][0])
                a["segments"] = segs(PHRASES[lang][1])
            r["appends"] = [a]
        recs.append(r)
    with open(os.path.join(d, "records.json"), "w", encoding="utf-8") as f:
        json.dump(recs, f, ensure_ascii=False)
    print("만듦:", d, len(recs), "건")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--lang", default="")
    ap.add_argument("--silent", action="store_true", help="say 대신 소리 없는 녹음 파일(소리를 내지 않는 캡처용)")
    a = ap.parse_args()
    global SILENT
    SILENT = a.silent
    for lang in ([a.lang] if a.lang else LANGS):
        build(lang, a.out)


if __name__ == "__main__":
    main()
