#!/usr/bin/env python3
"""스토어 스크린샷에 마케팅 문구를 얹는 스크립트.

사용 예 (Google Play 한국어):
  python3 tools/store-shot.py \
    --in store-assets/play/screenshots/ko \
    --out store-assets/play/screenshots-copy/ko \
    --size 1080x1920 --copy tools/store-shot-copy.json --lang ko

문구는 JSON 의 {언어: {order: [원본 파일명...], shots: {원본 파일명: {slug, title, sub}}}} 형태.
출력 파일 이름은 order 순서대로 앞 번호를 붙여 'NN-slug.png' (원본 캡처 이름은 그대로 두고 순서만 여기서 정한다).
큰 글의 [ ] 안 낱말만 파란색.
캔버스 크기에 맞춰 글자·목업 크기를 비례해서 키우므로 아이폰·아이패드도 같은 틀로 뽑는다.
"""
import argparse, json, re, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps
import random

FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
FONT_BOLD_INDEX = 6   # Bold
FONT_HEAVY_INDEX = 16  # Heavy (photo·collage·deep 큰 글)
PHOTO_DIR = os.path.expanduser("~/Pictures/albummory-shot-photos")
BG = (0xFB, 0xF7, 0xEF)
BG_BOTTOM = (0xF6, 0xF1, 0xE6)   # 아주 옅은 그라데이션 끝색
BLUE = (0x31, 0x82, 0xF6)
DARK = (0x2B, 0x2B, 0x2B)
GRAY = (0x7A, 0x73, 0x68)
BODY = (0x1E, 0x1E, 0x1E)


def parse_runs(line):
    """'[다시 만나요]' 형식을 (글자, 파랑여부) 조각 목록으로."""
    runs = []
    for m in re.finditer(r"\[([^\]]*)\]|([^\[]+)", line):
        if m.group(1) is not None:
            runs.append((m.group(1), True))
        else:
            runs.append((m.group(2), False))
    return runs


def draw_runs(d, runs, font, cx, y):
    """조각들을 이어 붙여 가운데 정렬로 그린다."""
    widths = [d.textlength(t, font=font) for t, _ in runs]
    x = cx - sum(widths) / 2
    for (t, blue), w in zip(runs, widths):
        d.text((x, y), t, font=font, fill=BLUE if blue else DARK)
        x += w


def make(src_path, out_path, W, H, title, sub):
    s = W / 1080  # 1080 폭 기준 배율
    # 바탕: 위→아래 옅은 그라데이션
    grad = Image.new("RGB", (1, H))
    for y in range(H):
        t = y / (H - 1)
        grad.putpixel((0, y), tuple(round(BG[i] + (BG_BOTTOM[i] - BG[i]) * t) for i in range(3)))
    canvas = grad.resize((W, H)).convert("RGBA")
    d = ImageDraw.Draw(canvas)

    f_big = ImageFont.truetype(FONT, round(88 * s), index=FONT_BOLD_INDEX)
    f_sub = ImageFont.truetype(FONT, round(42 * s), index=FONT_BOLD_INDEX - 4)  # Medium
    lines = title.split("\n")
    line_h = round(88 * s * 1.38)
    y = round(110 * s)
    for ln in lines:
        draw_runs(d, parse_runs(ln), f_big, W / 2, y)
        y += line_h
    y += round(14 * s)
    sw = d.textlength(sub, font=f_sub)
    d.text(((W - sw) / 2, y), sub, font=f_sub, fill=GRAY)
    text_bottom = y + round(42 * s * 1.2)

    # 폰 목업
    shot = Image.open(src_path).convert("RGB")
    bezel = round(14 * s)
    inner_w = round(W * 0.76) - 2 * bezel
    inner_h = round(shot.height * inner_w / shot.width)
    shot = shot.resize((inner_w, inner_h), Image.LANCZOS)
    r_in = round(56 * s)
    r_out = r_in + bezel
    pw, ph = inner_w + 2 * bezel, inner_h + 2 * bezel
    px = (W - pw) // 2
    py = text_bottom + round(70 * s)

    # 그림자 (넓게 번지고 아래로 살짝)
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        (px, py + round(30 * s), px + pw, py + ph + round(30 * s)), r_out, fill=(0, 0, 0, round(255 * 0.18)))
    sh = sh.filter(ImageFilter.GaussianBlur(round(40 * s)))
    canvas = Image.alpha_composite(canvas, sh)

    # 폰 몸체 + 화면(둥근 모서리)
    body = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    ImageDraw.Draw(body).rounded_rectangle((0, 0, pw - 1, ph - 1), r_out, fill=BODY + (255,))
    mask = Image.new("L", (inner_w, inner_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, inner_w - 1, inner_h - 1), r_in, fill=255)
    body.paste(shot, (bezel, bezel), mask)
    canvas.alpha_composite(body, (px, py))
    canvas.convert("RGB").save(out_path)


# ---------------------------------------------------------------
# 홍보지 스타일 (--style photo / collage / deep). plain 은 위의 make() 그대로.
# 장(slug)마다 어울리는 CC0 사진: hero=위 큰 사진·깊은색 아래 흐린 사진, polaroids=콜라주 폴라로이드
STYLE_PHOTOS = {
    "places": {"hero": "IMG_0012.JPG", "polaroids": ["IMG_0024.JPG", "IMG_0008.JPG", "IMG_0023.JPG"],
               "deep": ["IMG_0024.JPG", "IMG_0008.JPG"]},
    "storage": {"hero": "IMG_0017.JPG", "polaroids": ["IMG_0013.JPG", "IMG_0021.JPG", "IMG_0017.JPG"],
                "deep": ["IMG_0013.JPG", "IMG_0017.JPG"]},
}
DEFAULT_PHOTOS = STYLE_PHOTOS["places"]
PAPER = (0xFB, 0xF7, 0xEF)


def load_photo(name):
    im = Image.open(os.path.join(PHOTO_DIR, os.path.expanduser(name)))  # ~ 로 시작하면 다른 폴더 사진도 쓴다
    im = ImageOps.exif_transpose(im).convert("RGB")
    im.thumbnail((1800, 1800))  # 원본은 건드리지 않고 메모리에서만 줄여 쓴다
    return im


def cover(im, w, h, fx=0.5, fy=0.5):
    """비율 유지로 w×h 를 꽉 채우도록 잘라 맞춘다."""
    r = max(w / im.width, h / im.height)
    im = im.resize((max(w, round(im.width * r)), max(h, round(im.height * r))), Image.LANCZOS)
    x = round((im.width - w) * fx)
    y = round((im.height - h) * fy)
    return im.crop((x, y, x + w, y + h))


def fit_font(d, lines, W, s, idx, start=102, minimum=82):
    """가장 긴 줄이 폭 안에 들어오도록 글자 크기를 줄인다."""
    size = round(start * s)
    while True:
        f = ImageFont.truetype(FONT, size, index=idx)
        widest = max(sum(d.textlength(t, font=f) for t, _ in parse_runs(l)) for l in lines)
        if widest <= W - round(110 * s) or size <= round(minimum * s):
            return f, size
        size -= 2


def text_runs(canvas, runs, font, cx, y, base, key, shadow=None, s=1.0):
    """조각 이어 붙여 가운데 그리기. shadow=(색+알파) 이면 옅은 번진 그림자를 먼저 깐다."""
    d0 = ImageDraw.Draw(canvas)
    widths = [d0.textlength(t, font=font) for t, _ in runs]
    x0 = cx - sum(widths) / 2
    if shadow:
        lay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        ld = ImageDraw.Draw(lay)
        x = x0
        for (t, _), w in zip(runs, widths):
            ld.text((x, y + 4 * s), t, font=font, fill=shadow)
            x += w
        lay = lay.filter(ImageFilter.GaussianBlur(round(7 * s)))
        canvas.alpha_composite(lay)
    d = ImageDraw.Draw(canvas)
    x = x0
    for (t, k), w in zip(runs, widths):
        d.text((x, y), t, font=font, fill=key if k else base)
        x += w


def pill(canvas, cx, y, text, s, fill, fg, outline=None):
    """큰 글 위의 작은 둥근 알약 꼬리표."""
    f = ImageFont.truetype(FONT, round(31 * s), index=FONT_BOLD_INDEX)
    d = ImageDraw.Draw(canvas)
    tw = d.textlength(text, font=f)
    padx, h = round(34 * s), round(60 * s)
    box = (cx - tw / 2 - padx, y, cx + tw / 2 + padx, y + h)
    lay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(lay).rounded_rectangle(box, h // 2, fill=fill, outline=outline, width=max(2, round(2 * s)))
    canvas.alpha_composite(lay)
    ImageDraw.Draw(canvas).text((cx, y + h / 2), text, font=f, fill=fg, anchor="mm")


def draw_text_block(canvas, W, s, c, base, key, sub_col, shadow, pill_fill, pill_fg, pill_outline):
    """꼬리표 + 큰 글 + 작은 설명. 글 아래 y 를 돌려준다."""
    d = ImageDraw.Draw(canvas)
    lines = c["title"].split("\n")
    f_big, size = fit_font(d, lines, W, s, FONT_HEAVY_INDEX)
    y = round(96 * s) + round(c.get("_top", 0))
    if c.get("tag"):
        pill(canvas, W / 2, y, c["tag"], s, pill_fill, pill_fg, pill_outline)
        y += round(60 * s) + round(40 * s)
    lh = round(size * 1.3)
    for ln in lines:
        text_runs(canvas, parse_runs(ln), f_big, W / 2, y, base, key, shadow, s)
        y += lh
    y += round(6 * s)
    f_sub = ImageFont.truetype(FONT, round(42 * s), index=FONT_BOLD_INDEX - 4)
    sw = d.textlength(c["sub"], font=f_sub)
    if shadow:
        lay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        ImageDraw.Draw(lay).text(((W - sw) / 2, y + 3 * s), c["sub"], font=f_sub, fill=shadow)
        canvas.alpha_composite(lay.filter(ImageFilter.GaussianBlur(round(6 * s))))
    ImageDraw.Draw(canvas).text(((W - sw) / 2, y), c["sub"], font=f_sub, fill=sub_col)
    return y + round(42 * s * 1.2)


def open_src(src):
    """경로 또는 이미지 객체를 RGB 이미지로 돌려준다."""
    return src.convert("RGB") if isinstance(src, Image.Image) else Image.open(src).convert("RGB")


def is_tablet(src_path):
    """캡처 가로/세로 비율이 0.6 보다 크면 태블릿(아이패드·듀오 펼침 비율)으로 본다. 아이폰은 약 0.46."""
    w, h = open_src(src_path).size
    return w / h > 0.6


def phone_layer(src_path, W, H, s, px_w, py, angle=0.0, shadow_alpha=0.30, tablet=False):
    """둥근 짙은 테두리 폰(태블릿이면 얇은 테두리·작은 모서리) + 넓고 부드러운 그림자를 한 레이어로 만들어 angle 도 기울인다."""
    shot = open_src(src_path)
    bezel = round((9 if tablet else 14) * s)
    inner_w = px_w - 2 * bezel
    inner_h = round(shot.height * inner_w / shot.width)
    shot = shot.resize((inner_w, inner_h), Image.LANCZOS)
    r_in = round((22 if tablet else 56) * s)
    r_out = r_in + bezel
    pw, ph = inner_w + 2 * bezel, inner_h + 2 * bezel
    px = (W - pw) // 2
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        (px, py + round(36 * s), px + pw, py + ph + round(36 * s)), r_out, fill=(0, 0, 0, round(255 * shadow_alpha)))
    lay.alpha_composite(sh.filter(ImageFilter.GaussianBlur(round(46 * s))))
    body = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    ImageDraw.Draw(body).rounded_rectangle((0, 0, pw - 1, ph - 1), r_out, fill=BODY + (255,))
    mask = Image.new("L", (inner_w, inner_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, inner_w - 1, inner_h - 1), r_in, fill=255)
    body.paste(shot, (bezel, bezel), mask)
    lay.alpha_composite(body, (px, py))
    if angle:
        lay = lay.rotate(angle, center=(W / 2, py + ph / 2), resample=Image.BICUBIC)
    return lay


def polaroid(photo, w, angle, s, tape_angle=-4):
    """흰 테두리 폴라로이드(옅은 그림자) + 위쪽 반투명 크림색 테이프. 회전한 RGBA 를 돌려준다."""
    border, bottom = round(16 * s), round(58 * s)
    iw = w - 2 * border
    ih = round(iw * 0.82)
    h = border + ih + bottom
    pad = round(60 * s)
    lay = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    sh = Image.new("RGBA", lay.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rectangle((pad, pad + 14 * s, pad + w, pad + h + 14 * s), fill=(0, 0, 0, 70))
    lay.alpha_composite(sh.filter(ImageFilter.GaussianBlur(round(20 * s))))
    ImageDraw.Draw(lay).rectangle((pad, pad, pad + w - 1, pad + h - 1), fill=(255, 255, 255, 255))
    lay.paste(cover(photo, iw, ih), (pad + border, pad + border))
    tw, th = round(150 * s), round(46 * s)
    tape = Image.new("RGBA", (tw, th), (246, 236, 205, 175))
    tape = tape.rotate(tape_angle, expand=True, resample=Image.BICUBIC)
    lay.alpha_composite(tape, (pad + w // 2 - tape.width // 2, pad - th // 2 - round(4 * s)))
    return lay.rotate(angle, expand=True, resample=Image.BICUBIC)



# ---------------------------------------------------------------
# memo 스타일: 폴라로이드 대신 일정 앱에 맞는 종이 소품(포스트잇·달력 낱장·할 일 쪽지)을 Pillow 로 그린다
HAND_FONT = "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/1fb44cf128344a11e654a43ccd7a45a68026bf5d.asset/AssetData/NanumScript.ttc"
INK = (0x30, 0x20, 0x14)  # 손글씨 짙은 갈색(작은 화면에서도 읽히게 진하게)
PROP_K = [1.0]  # 폰이 커서 바깥 여백이 좁을 때 손글씨를 줄이는 배율(make_styled 가 정함)


def hand_font(size):
    """나눔손글씨 펜이 있으면 쓰고, 없으면 산돌고딕 보통."""
    size = round(size * PROP_K[0])
    try:
        return ImageFont.truetype(HAND_FONT, size, index=1)
    except OSError:
        return ImageFont.truetype(FONT, size, index=4)


def hand_text(d, xy, txt, font, S):
    """획을 1px 덧그려 굵게(같은 글꼴에 굵은 것이 없다)."""
    d.text(xy, txt, font=font, fill=INK, stroke_width=max(1, round(S(0.9))), stroke_fill=INK)


def paper_prop(w, h, s, painter, angle, tape_angle, right=False):
    """w×h(1080 기준 px) 종이 소품 + 옅은 그림자 + 크림색 테이프를 한 장 레이어로 만들어 회전해 돌려준다.
    painter(d, S, w, h, right) 는 (0,0)~(w,h) 안에 그린다(S = 배율 함수)."""
    S = lambda v: round(v * s)
    ww, hh = S(w), S(h)
    pad = S(60)
    lay = Image.new("RGBA", (ww + 2 * pad, hh + 2 * pad), (0, 0, 0, 0))
    sh = Image.new("RGBA", lay.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rectangle((pad, pad + S(14), pad + ww, pad + hh + S(14)), fill=(0, 0, 0, 70))
    lay.alpha_composite(sh.filter(ImageFilter.GaussianBlur(S(20))))
    paper = Image.new("RGBA", (ww, hh), (0, 0, 0, 0))
    painter(ImageDraw.Draw(paper), S, w, h, right)
    lay.alpha_composite(paper, (pad, pad))
    tw, th = S(150), S(46)
    tape = Image.new("RGBA", (tw, th), (246, 236, 205, 175)).rotate(tape_angle, expand=True, resample=Image.BICUBIC)
    lay.alpha_composite(tape, (pad + ww // 2 - tape.width // 2, pad - th // 2 - S(4)))
    return lay.rotate(angle, expand=True, resample=Image.BICUBIC)


GEO = {"margin": 194.0, "ex": 175.0}  # 폰 바깥 한쪽 여백(1080 기준)과 소품 중심 위치 — make_styled 가 정한다


def prop_region(w, right):
    """폰에 가리지 않고 보이는 바깥 여백 안의 (글 시작 x, 가운데 x, 쓸 수 있는 너비). 소품 좌표(1080 기준). right=True 면 오른쪽 소품."""
    if GEO.get("front"):  # 소품을 폰 앞에 놓는 방식(iOS): 소품 전체가 보이므로 종이 전체를 쓴다
        return 24, w / 2, w - 48
    m, ex = GEO["margin"], GEO["ex"]
    if right:
        return ex - 15 + w / 2 + 40 - m, ex - 15 + w / 2 - m / 2 + 8, m - 48 - 24
    return 22, m / 2 - (ex - 15 - w / 2), m - (ex - 15 - w / 2 + 22) - 40


def fit_hand(lines, avail, S, size=54, extra=0):
    """가장 긴 줄이 avail(1080 기준 px) 안에 들어오도록 손글씨 크기를 줄여 글꼴을 돌려준다."""
    k = size
    while True:
        f = hand_font(S(k))
        wd = max(f.getlength(t) for t in lines) + S(extra)
        if wd <= S(avail) or k <= 26:
            return f
        k -= 2


def prop_sticky(lines):
    """포스트잇: 옅은 노랑 정사각 + 위쪽 진한 띠 + 손글씨 2줄(보이는 쪽에 붙여 쓴다)."""
    def paint(d, S, w, h, right):
        d.rectangle((0, 0, S(w) - 1, S(h) - 1), fill=(0xF7, 0xE7, 0xA6, 255))
        d.rectangle((0, 0, S(w) - 1, S(36)), fill=(0xEA, 0xD3, 0x82, 255))
        x0, _, av = prop_region(w, right)
        f = fit_hand(lines, av, S)
        y = S(80)
        for ln in lines:
            hand_text(d, (S(x0), y), ln, f, S)
            y += S(74)
    return paint


def fit_font_w(txt, avail, S, size, idx):
    """txt 가 avail(1080 기준 px) 폭 안에 들어오도록 줄인 고딕 글꼴."""
    k = size
    while k > 14:
        f = ImageFont.truetype(FONT, S(k), index=idx)
        if f.getlength(txt) <= S(avail):
            return f
        k -= 2
    return f


def prop_calendar(month, day, note):
    """종이 달력 낱장: 흰 종이 + 빨강-갈색 띠(월) + 큰 날짜 + 아래 작은 글 + 스프링 구멍."""
    def paint(d, S, w, h, right):
        _, cx, av = prop_region(w, right)
        d.rectangle((0, 0, S(w) - 1, S(h) - 1), fill=(0xFD, 0xFB, 0xF6, 255))
        d.rectangle((0, 0, S(w) - 1, S(80)), fill=(0xA8, 0x5C, 0x4E, 255))
        mf = fit_font_w(month, av, S, 42, FONT_BOLD_INDEX)
        d.text((S(cx), S(48)), month, font=mf, fill=(0xFB, 0xF2, 0xE0), anchor="mm")
        for i in range(5):
            hx = S(w) * (i + 1) / 6
            d.ellipse((hx - S(9), S(10) - S(9), hx + S(9), S(10) + S(9)), fill=(0xE4, 0xDB, 0xCB, 255))
        d.text((S(cx), S(168)), day, font=fit_font_w(day, av, S, 128, FONT_HEAVY_INDEX), fill=(0x3A, 0x2E, 0x24), anchor="mm")
        d.line((S(cx) - S(80), S(240), S(cx) + S(80), S(240)), fill=(0xD9, 0xCF, 0xBE, 255), width=max(2, S(2)))
        d.text((S(cx), S(278)), note, font=fit_font_w(note, av, S, 32, FONT_BOLD_INDEX - 2), fill=(0x6B, 0x5A, 0x4A), anchor="mm")
    return paint


def prop_todo(items):
    """할 일 쪽지: 옅은 파란 줄 노트 + 도형 체크박스(items=[(글, 체크여부)])."""
    def paint(d, S, w, h, right):
        d.rectangle((0, 0, S(w) - 1, S(h) - 1), fill=(0xFD, 0xFC, 0xF8, 255))
        d.rectangle((0, 0, S(w) - 1, S(34)), fill=(0xE9, 0xE2, 0xD3, 255))
        for y in range(S(96), S(h) - S(10), S(60)):
            d.line((S(14), y, S(w) - S(14), y), fill=(0xB9, 0xCB, 0xDE, 255), width=max(2, S(2)))
        x0, _, av = prop_region(w, right)
        f = fit_hand([t for t, _ in items], av, S, extra=46)
        y = S(46)
        for txt, done in items:
            bx, by, bs = S(x0), y + S(10), S(32)
            d.rectangle((bx, by, bx + bs, by + bs), outline=INK, width=max(4, S(4)))
            if done:
                d.line((bx + S(6), by + S(17), bx + S(13), by + S(25), bx + S(30), by + S(3)), fill=(0x3F, 0x7D, 0x5A, 255), width=S(5), joint="curve")
            hand_text(d, (bx + S(46), y - S(2)), txt, f, S)
            y += S(60)
    return paint


MEMO_SETS = {
    # 장(slug)마다 소품 내용·배치 순서를 다르게 (위·가운데·아래). 장끼리 같은 글이 반복되지 않게
    "speak": [("calendar", ("11월", "24", "치과 예약")), ("sticky", ["엄마 병원", "금 오전 9시"]),
              ("todo", [("약 먹기", True), ("장보기", False), ("전화", False)])],
    "record": [("sticky", ["미용실", "목 오후 3시"]), ("todo", [("은행", True), ("택배", True), ("세차", False)]),
               ("calendar", ("12월", "3", "자동차 점검"))],
    "calendar": [("sticky", ["엄마 생신", "음력 꼭 챙기기"]), ("calendar", ("음력 10월", "16", "어머니 생신")),
                 ("todo", [("선물", True), ("기념일", False), ("제사", False)])],
    "widget": [("sticky", ["홈 화면에", "딱 붙여요"]), ("todo", [("일정", True), ("마이크", True), ("달력", False)]),
               ("calendar", ("11월", "28", "친구 점심"))],
    "attach": [("sticky", ["가족사진", "붙이기"]), ("calendar", ("12월", "5", "제주 여행")),
               ("todo", [("사진", True), ("영수증", False), ("예약서", False)])],
    "day": [("sticky", ["25일", "저녁 7시"]), ("todo", [("점심", True), ("운동", False), ("도서관", False)]),
            ("calendar", ("11월", "29", "가족 모임"))],
    "large": [("sticky", ["큰 글씨", "편하게"]), ("todo", [("약 시간", True), ("병원", False), ("손주", False)]),
              ("calendar", ("12월", "1", "경로당 모임"))],
}
MEMO_SIZE = {"sticky": (270, 270), "calendar": (270, 320), "todo": (280, 290)}


def memo_props(c, s, angles=(-7, 6, -5)):
    out = []
    for (kind, arg), ang, ta in zip(MEMO_SETS.get(c["slug"], MEMO_SETS["speak"]), angles, (-5, 4, 3)):
        w, h = MEMO_SIZE[kind]
        p = {"sticky": prop_sticky, "calendar": prop_calendar, "todo": prop_todo}[kind](*([arg] if kind != "calendar" else arg))
        out.append((w, h, p, ang, ta))
    return out


def screen_edge_x(W, pw, ph, py, bz, angle, y, right):
    """phone_layer 가 angle 도 돌린 폰에서, 캔버스 높이 y 에 있는 화면(테두리 안쪽) 왼쪽/오른쪽 가장자리 x."""
    import math
    th = math.radians(angle)
    cx, cyc = W / 2, py + ph / 2
    X = (pw / 2 - bz) * (1 if right else -1)
    yy = (y - cyc + X * math.sin(th)) / math.cos(th)
    return cx + X * math.cos(th) + yy * math.sin(th)


def front_prop(W, s, pw, ph, py, bz, angle, cy, w, h, painter, ang, ta, right):
    """폰 앞에 놓는 종이 소품(iOS). 캔버스 가장자리 ~ 폰 화면 가장자리보다 조금 안쪽까지를 꽉 채우도록 배율 k 를 정한다.
    화면 안으로는 inset 만큼만 들어간다(앱 화면 옆 여백 정도라 내용을 가리지 않는다). info 에 놓을 중심(cx, cy)을 담아 돌려준다."""
    import math
    pad, inset = 14 * s, 12 * s
    a = math.radians(abs(ang))
    k = 1.0
    for _ in range(3):  # 소품 높이에 따라 위아래 끝의 폰 가장자리가 달라서 두어 번 맞춘다
        hh = h * s * k
        ys_ = (cy - hh / 2, cy + hh / 2)
        if right:
            L = max(screen_edge_x(W, pw, ph, py, bz, angle, y, True) for y in ys_) - inset
            R = W - pad
        else:
            L = pad
            R = min(screen_edge_x(W, pw, ph, py, bz, angle, y, False) for y in ys_) + inset
        k = min(1.0, (R - L) / ((w * math.cos(a) + h * math.sin(a)) * s))
    bw = (w * math.cos(a) + h * math.sin(a)) * s * k
    bh = (h * math.cos(a) + w * math.sin(a)) * s * k
    cx = R - bw / 2 if right else L + bw / 2
    pl = paper_prop(w, h, s * k, painter, ang, ta, right)
    pl.info["cx"], pl.info["cy"] = cx, cy
    pl.info["bh"] = bh
    return pl


def make_styled(style, src_path, out_path, W, H, c):
    s = W / 1080
    ph_set = STYLE_PHOTOS.get(c["slug"], DEFAULT_PHOTOS)
    canvas = Image.new("RGBA", (W, H), PAPER + (255,))

    if style == "photo":
        top = round(H * 0.55)
        hero = cover(load_photo(ph_set["hero"]), W, top, 0.5, 0.45).convert("RGBA")
        # 글씨가 읽히도록 살짝 어두운 막
        hero = Image.alpha_composite(hero, Image.new("RGBA", hero.size, (20, 16, 12, 105)))
        # 아래로 갈수록 종이색으로 녹는 마스크
        m = Image.new("L", (1, top))
        for y in range(top):
            t = max(0.0, (y - top * 0.50) / (top * 0.50))
            m.putpixel((0, y), round(255 * (1 - t * t * (3 - 2 * t))))
        hero.putalpha(m.resize((W, top)))
        canvas.alpha_composite(hero, (0, 0))
        tb = draw_text_block(canvas, W, s, c, (255, 255, 255), (0xFF, 0xD9, 0x8A), (255, 255, 255, 235),
                             (0, 0, 0, 110), (255, 255, 255, 60), (255, 255, 255, 255), (255, 255, 255, 190))
        canvas.alpha_composite(phone_layer(src_path, W, H, s, round(W * 0.74), tb + round(64 * s)))

    elif style in ("collage", "memo"):
        # 아주 옅은 종이 질감
        noise = Image.effect_noise((W, H), 26).convert("RGBA")
        noise.putalpha(14)
        canvas.alpha_composite(noise)
        src_img = open_src(src_path)
        tab = is_tablet(src_img)  # 자르기 전 비율로 판단(위아래를 잘라 낸 폰 캡처가 태블릿으로 오인되지 않게)
        if c.get("crop") and c.get("_strip"):  # [위, 아래] 픽셀: 안드로이드 상태 표시줄·내비게이션 바를 잘라 낸다
            src_img = src_img.crop((0, c["crop"][0], src_img.width, c["crop"][1]))
        src_path = src_img
        sw_, sh_ = src_img.size
        bz = round((9 if tab else 14) * s)
        # 글 높이를 먼저 재 보고(복사본에 그림), 폰이 짧아 남는 아래 공간은 글 위·글~폰 사이·아래로 나눠 쓴다
        tb0 = draw_text_block(canvas.copy(), W, s, dict(c, _top=0), (0x3A, 0x2E, 0x24), BLUE, (0x7A, 0x6A, 0x5A), None,
                              (0x3A, 0x2E, 0x24, 255), (0xFB, 0xF2, 0xE0, 255), None)
        # 폰 너비: 캔버스 폭의 frac(기본 64%). 태블릿은 82%. 폰 아래가 캔버스 밖으로 살짝(cut) 잘려도 된다
        pw_target = round(W * (0.82 if tab else c.get("_pwfrac", 0.64)))
        if not tab:
            avail_h = H - (tb0 + round(60 * s)) + round(70 * s) - 2 * bz
            pw_target = min(pw_target, round(avail_h * sw_ / sh_) + 2 * bz)
        ph_h = round((pw_target - 2 * bz) * sh_ / sw_) + 2 * bz  # 폰 전체 높이
        slack = max(0, H - (tb0 + round(60 * s)) - ph_h - round(40 * s)) if not tab else 0
        top_extra = round(slack * 0.40)
        tb = draw_text_block(canvas, W, s, dict(c, _top=top_extra), (0x3A, 0x2E, 0x24), BLUE, (0x7A, 0x6A, 0x5A), None,
                             (0x3A, 0x2E, 0x24, 255), (0xFB, 0xF2, 0xE0, 255), None)
        py = tb + round(60 * s) + round(slack * 0.25)
        flip = c.get("_idx", 0) % 2  # 장마다 폰 기울기·소품 쪽을 번갈아
        sign = -1 if flip else 1
        # 폰 바깥 여백이 좁으면 손글씨를 같은 비율로 줄인다
        margin_s = (W - pw_target) / 2 / s
        PROP_K[0] = 1.0
        GEO["margin"] = margin_s
        GEO["front"] = bool(c.get("_front"))
        if tab:
            pl_w = 200
            ex = (W / s - pw_target / s) / 2 + 30
            vis_h = min(ph_h, H - py - round(120 * s))
        else:
            pl_w = 320
            ex = 175
            vis_h = ph_h
        GEO["ex"] = ex
        ys = (0.16, 0.49, 0.81)
        if style == "collage":
            names = c.get("polaroids") or ph_set["polaroids"]
            photos = [load_photo(n) for n in names]
            spec = [
                (photos[0], pl_w, -7, ex, (py + 0.16 * vis_h) / s, -5),
                (photos[1], pl_w, 6, W / s - ex, (py + 0.49 * vis_h) / s, 4),
                (photos[2], pl_w, -5, ex, (py + 0.81 * vis_h) / s, 3),
            ]
            for ph, w, ang, cx, cy, ta in spec:
                if flip:  # 좌우 반전 배치
                    cx, ang, ta = W / s - cx, -ang, -ta
                pl = polaroid(ph, round(w * s), ang, s, ta)
                canvas.alpha_composite(pl, (round(cx * s - pl.width / 2), round(cy * s - pl.height / 2)))
        elif c.get("_front"):  # memo(iOS): 소품을 폰 앞에 놓고, 폰 화면 안으로는 아주 조금만 들어가게 키운다
            angle = 2.5 * sign
            canvas.alpha_composite(phone_layer(src_path, W, H, s, pw_target, py, angle=angle, tablet=tab))
            for i, (w, h, painter, ang, ta) in enumerate(memo_props(c, s, angles=(-4, 4, -3))):
                # 폰이 기울어 위·아래 끝은 한쪽 여백이 넓다: angle>0(반시계)이면 위는 오른쪽, 아래는 왼쪽이 넓다.
                # 위 소품은 위가 넓은 쪽, 아래 소품은 그 반대쪽, 가운데 소품은 장마다 번갈아 둔다
                top_right = angle > 0
                right = (top_right, c.get("_idx", 0) // 2 % 2 == 1, not top_right)[i]
                cy = py + ys[i] * vis_h
                pl = front_prop(W, s, pw_target, ph_h, py, bz, angle, cy, w, h, painter, ang, ta, right)
                canvas.alpha_composite(pl, (round(pl.info["cx"] - pl.width / 2), round(pl.info["cy"] - pl.height / 2)))
            canvas.convert("RGB").save(out_path)
            return
        else:  # memo: 같은 자리에 종이 소품 3개
            for i, (w, h, painter, ang, ta) in enumerate(memo_props(c, s)):
                cx = (ex - 15) if i % 2 == 0 else W / s - (ex - 15)
                cy = (py + ys[i] * vis_h) / s
                if flip:
                    cx, ang, ta = W / s - cx, -ang, -ta
                pl = paper_prop(w, h, s, painter, ang, ta, right=(cx > W / s / 2))
                canvas.alpha_composite(pl, (round(cx * s - pl.width / 2), round(cy * s - pl.height / 2)))
        canvas.alpha_composite(phone_layer(src_path, W, H, s, pw_target, py, angle=2.5 * sign, tablet=tab))

    elif style == "deep":
        top_c, bot_c = (0x1F, 0x2A, 0x44), (0x2D, 0x3B, 0x5A)
        g = Image.new("RGB", (1, H))
        for y in range(H):
            t = y / (H - 1)
            g.putpixel((0, y), tuple(round(top_c[i] + (bot_c[i] - top_c[i]) * t) for i in range(3)))
        canvas = g.resize((W, H)).convert("RGBA")
        # 바탕 아래쪽에 흐린 사진 2장 (투명 25%), 위로 갈수록 사라지게
        band_h = round(H * 0.42)
        for i, n in enumerate(ph_set["deep"]):
            ph = cover(load_photo(n), W // 2 + 2, band_h).filter(ImageFilter.GaussianBlur(round(7 * s))).convert("RGBA")
            a = Image.new("L", (1, band_h))
            for y in range(band_h):
                a.putpixel((0, y), round(64 * min(1.0, y / (band_h * 0.6))))  # 최대 25%
            ph.putalpha(a.resize((ph.width, band_h)))
            canvas.alpha_composite(ph, (i * (W // 2), H - band_h))
        tb = draw_text_block(canvas, W, s, c, (255, 255, 255), (0xE8, 0xC2, 0x7A), (205, 212, 228, 255), (0, 0, 0, 90),
                             (0xE8, 0xC2, 0x7A, 30), (0xE8, 0xC2, 0x7A, 255), (0xE8, 0xC2, 0x7A, 200))
        py = tb + round(66 * s)
        # 폰 뒤 아주 옅은 빛 번짐
        glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(glow).ellipse((W * 0.06, py + 120 * s, W * 0.94, py + 1500 * s), fill=(150, 180, 255, 46))
        canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(round(130 * s))))
        canvas.alpha_composite(phone_layer(src_path, W, H, s, round(W * 0.74), py, shadow_alpha=0.45))
    else:
        raise SystemExit("알 수 없는 style: " + style)
    canvas.convert("RGB").save(out_path)


# ---------------------------------------------------------------
# bold 스타일: 큰 글자 + 1·2번이 이어지는 파노라마 + 3번부터 위쪽 물결 색 띠
INK_BROWN = (0x3A, 0x2E, 0x24)
YELLOW = (0xFF, 0xE2, 0x7A)
BOLD_FONT = [FONT, FONT_HEAVY_INDEX]  # --bold-font 로 바꿀 수 있다(상업 사용 가능한 글꼴만)


def bold_font(size):
    return ImageFont.truetype(BOLD_FONT[0], round(size), index=BOLD_FONT[1])


def crop_src(c, strip):
    """원본을 열고, strip 이면 crop=[위, 아래] 로 안드로이드 상태 표시줄·내비게이션 바를 잘라 낸다."""
    im = open_src(c["src"])
    if strip and c.get("crop"):
        im = im.crop((0, c["crop"][0], im.width, c["crop"][1]))
    return im


def phone_img(shot, inner_w, s, shadow_alpha=0.28, frame=BODY):
    """기종을 특정하지 않는 둥근 짙은 틀 폰 + 넓은 그림자. 폰 몸체가 이미지 한가운데 오도록 여백을 둔 RGBA."""
    bezel = round(15 * s)
    inner_h = round(shot.height * inner_w / shot.width)
    shot = shot.resize((inner_w, inner_h), Image.LANCZOS)
    r_in = round(58 * s)
    r_out = r_in + bezel
    pw, ph = inner_w + 2 * bezel, inner_h + 2 * bezel
    pad = round(140 * s)
    lay = Image.new("RGBA", (pw + 2 * pad, ph + 2 * pad), (0, 0, 0, 0))
    sh = Image.new("RGBA", lay.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((pad, pad + round(34 * s), pad + pw, pad + ph + round(34 * s)), r_out,
                                         fill=(0, 0, 0, round(255 * shadow_alpha)))
    lay.alpha_composite(sh.filter(ImageFilter.GaussianBlur(round(44 * s))))
    body = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    ImageDraw.Draw(body).rounded_rectangle((0, 0, pw - 1, ph - 1), r_out, fill=frame + (255,))
    mask = Image.new("L", (inner_w, inner_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, inner_w - 1, inner_h - 1), r_in, fill=255)
    body.paste(shot, (bezel, bezel), mask)
    lay.alpha_composite(body, (pad, pad))
    return lay, pw, ph


def runs_width(runs, font):
    return sum(font.getlength(t) for t, _ in runs)


def fit_lines(lines, max_w, size, minimum):
    """가장 긴 줄이 max_w 안에 들어오는 가장 큰 bold 글꼴."""
    while True:
        f = bold_font(size)
        if max(runs_width(parse_runs(l), f) for l in lines) <= max_w or size <= minimum:
            return f, size
        size -= 2


def draw_line(canvas, runs, font, x, y, base, key, align="left", shadow=None, s=1.0):
    """조각을 이어 그린다. align=left 면 x 가 왼쪽 끝, center 면 가운데. y 는 글자 윗선(ascender 기준 'ls')."""
    w = runs_width(runs, font)
    x0 = x if align == "left" else x - w / 2
    if shadow:
        lay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        ld = ImageDraw.Draw(lay)
        xx = x0
        for t, _ in runs:
            ld.text((xx, y + 6 * s), t, font=font, fill=shadow, anchor="ls")
            xx += font.getlength(t)
        canvas.alpha_composite(lay.filter(ImageFilter.GaussianBlur(round(10 * s))))
    d = ImageDraw.Draw(canvas)
    xx = x0
    for t, k in runs:
        d.text((xx, y), t, font=font, fill=key if k else base, anchor="ls")
        xx += font.getlength(t)
    return x0, x0 + w


def vgrad(W, H, top, bot):
    g = Image.new("RGB", (1, H))
    for y in range(H):
        t = y / (H - 1)
        g.putpixel((0, y), tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return g.resize((W, H)).convert("RGBA")


def paper_bg(W, H, s):
    c = vgrad(W, H, BG, BG_BOTTOM)
    noise = Image.effect_noise((W, H), 26).convert("RGBA")
    noise.putalpha(12)
    c.alpha_composite(noise)
    return c


def bubble(canvas, x, y, text, s, max_w, fill, fg, tail="left"):
    """말풍선(둥근 네모 + 아래 꼬리). (x, y)=왼쪽 위. 글이 max_w 를 넘으면 글자를 줄인다.
    canvas=None 이면 그리지 않고 (너비, 꼬리까지 높이) 만 돌려준다."""
    k = 48
    while True:
        f = ImageFont.truetype(FONT, round(k * s), index=FONT_BOLD_INDEX)
        tw = f.getlength(text)
        if tw + round(2 * 40 * s) <= max_w or k <= 30:
            break
        k -= 1
    padx, h = round(40 * s), round(k * s * 2.3)
    w = tw + 2 * padx
    if canvas is None:
        return round(w), round(h + 34 * s)
    lay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(lay)
    ld.rounded_rectangle((x, y, x + w, y + h), round(h * 0.42), fill=fill)
    tx = x + round(70 * s) if tail == "left" else x + w - round(70 * s)
    ld.polygon([(tx - 18 * s, y + h - 2), (tx + 18 * s, y + h - 2), (tx - (26 if tail == "left" else -26) * s, y + h + 34 * s)], fill=fill)
    sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((x, y + 10 * s, x + w, y + h + 10 * s), round(h * 0.42), fill=(0, 0, 0, 40))
    canvas.alpha_composite(sh.filter(ImageFilter.GaussianBlur(round(14 * s))))
    canvas.alpha_composite(lay)
    ImageDraw.Draw(canvas).text((x + w / 2, y + h / 2), text, font=f, fill=fg, anchor="mm")
    return round(w), round(h + 34 * s)


def wave_bars(canvas, x0, x1, cy, s, color, max_h, seed=3):
    """말소리 파형 막대(둥근 세로 막대). 두 장 사이 이음매를 넘어 이어지는 장식."""
    rnd = random.Random(seed)
    d = ImageDraw.Draw(canvas)
    bw, gap = round(16 * s), round(14 * s)
    x = x0
    i = 0
    import math
    while x < x1:
        env = 0.35 + 0.65 * abs(math.sin(i * 0.23)) * (0.6 + 0.4 * rnd.random())
        h = max(bw, max_h * env)
        d.rounded_rectangle((x, cy - h / 2, x + bw, cy + h / 2), bw // 2, fill=color)
        x += bw + gap
        i += 1


def phone_mask(rot, ox, oy, CW, H, thr=200):
    """회전한 폰 레이어의 몸체(그림자 제외)를 캔버스 크기 불리언 배열로."""
    import numpy as np
    m = np.zeros((H, CW), bool)
    al = np.array(rot.getchannel("A")) > thr
    x0, y0 = max(0, ox), max(0, oy)
    x1, y1 = min(CW, ox + rot.width), min(H, oy + rot.height)
    if x1 > x0 and y1 > y0:
        m[y0:y1, x0:x1] = al[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
    return m


def body_bbox(rot):
    """회전한 폰 레이어에서 몸체(그림자 제외)의 (왼, 위, 오른, 아래)."""
    return rot.getchannel("A").point(lambda v: 255 if v > 200 else 0).getbbox()


def make_pano(c, src_l, src_r, out_l, out_r, W, H, variant="blue"):
    """두 장 폭(2W×H) 캔버스 한 장을 그린 뒤 반으로 잘라 1·2번을 만든다. 두 장 모두 혼자서도 '큰 제목 + 폰'이 보이게:
    1번: 위 말풍선 + 큰 제목 2줄, 아래 시계 방향으로 기울인 말하기 폰(오른쪽 끝자락이 이음매를 넘어 2번으로).
    2번: 위 보조 문구 + 큰 제목 2줄, 아래 1번 폰 끝자락을 피해 반대로 살짝 기울인 녹음 상세 폰.
    아래를 가로지르는 말소리 파형 띠가 두 장을 잇는다."""
    import math
    import numpy as np
    s = W / 1080
    CW = 2 * W
    if variant == "blue":
        canvas = vgrad(CW, H, (0x3A, 0x8C, 0xFA), (0x1F, 0x63, 0xDB))
        base, key, sub_fill, sub_fg = (255, 255, 255), YELLOW, (255, 255, 255, 255), INK_BROWN
        bar_col = (255, 255, 255, 46)
        glow_col = (255, 255, 255, 34)
        tshadow = (0, 0, 0, 60)
        sub_col = (255, 255, 255, 235)
    else:
        canvas = paper_bg(CW, H, s)
        base, key, sub_fill, sub_fg = INK_BROWN, BLUE, (255, 255, 255, 255), INK_BROWN
        bar_col = BLUE + (46,)
        glow_col = BLUE + (22,)
        tshadow = None
        sub_col = INK_BROWN
    # 이음매를 넘는 큰 빛 원(두 장을 한 장처럼 묶는 바탕 장식)
    glow = Image.new("RGBA", (CW, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((W - 0.55 * W, H * 0.30, W + 0.55 * W, H * 0.30 + 1.1 * W), fill=glow_col)
    canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(round(30 * s))))
    # 아래쪽 말소리 파형: 두 장을 가로질러 이어진다(폰 뒤로 지나간다)
    bars = Image.new("RGBA", (CW, H), (0, 0, 0, 0))
    wave_bars(bars, round(40 * s), CW - round(40 * s), H * 0.915, s, bar_col, 150 * s)
    canvas.alpha_composite(bars)

    # ---- 위쪽 글: 두 장의 제목을 같은 크기·같은 높이로 ----
    mx = round(70 * s)
    lines_l = c["title"].split("\n")
    lines_r = c["title_r"].split("\n")
    f, size = fit_lines(lines_l + lines_r, W - 2 * mx, 210 * s, 120 * s)
    lh = round(size * 1.12)
    asc, desc = f.getmetrics()
    y0 = round(H * 0.045)
    bub_w, bub_h = bubble(None, 0, 0, c["sub"], s, W - 2 * mx, None, None)
    bubble(canvas, mx, y0, c["sub"], s, W - 2 * mx, sub_fill, sub_fg)
    # 2번 보조 문구: 1번 말풍선과 같은 높이(꼬리 뺀 몸통의 가운데)
    f_sub = ImageFont.truetype(FONT, round(52 * s), index=FONT_BOLD_INDEX)
    while f_sub.getlength(c["sub_r"]) > W - 2 * mx and f_sub.size > 30:
        f_sub = ImageFont.truetype(FONT, f_sub.size - 2, index=FONT_BOLD_INDEX)
    ImageDraw.Draw(canvas).text((W + mx, y0 + (bub_h - round(34 * s)) / 2), c["sub_r"], font=f_sub, fill=sub_col, anchor="lm")
    y_t = y0 + bub_h + round(30 * s)
    for i in range(max(len(lines_l), len(lines_r))):
        y = y_t + asc + lh * i
        if i < len(lines_l):
            draw_line(canvas, parse_runs(lines_l[i]), f, mx, y, base, key, shadow=tshadow, s=s)
        if i < len(lines_r):
            draw_line(canvas, parse_runs(lines_r[i]), f, W + mx, y, base, key, shadow=tshadow, s=s)
    text_bottom = y_t + asc + lh * (max(len(lines_l), len(lines_r)) - 1) + round(desc * 0.4)
    top = text_bottom + round(50 * s)  # 폰이 시작할 수 있는 가장 높은 줄

    # ---- 1번 폰: 시계 방향으로 기울여, 위쪽 오른 모서리 끝자락(over)만 이음매를 넘게 ----
    angle = c.get("_pano_angle", -9.0)  # PIL rotate: 음수 = 시계 방향
    over = c.get("_pano_over", 0.15)    # 2번으로 넘어가는 몫(회전한 폰 폭 기준)
    bottom = H - round(30 * s)          # 맨 아래 오른 모서리(완료 버튼 쪽)까지 1번 안에 온전히
    inner_w = round(W * 0.90)
    while True:
        lay, pw, ph = phone_img(src_l, inner_w, s, shadow_alpha=0.34)
        rot = lay.rotate(angle, expand=True, resample=Image.BICUBIC)
        bx0, by0, bx1, by1 = body_bbox(rot)
        bw, bh = bx1 - bx0, by1 - by0
        left = W + over * bw - bw
        if (bh <= bottom - top and left >= round(36 * s)) or inner_w < W * 0.4:
            break
        inner_w -= 6
    ox = round(W + over * bw - bx1)
    oy = round(top + (bottom - top - bh) / 2 - by0)
    canvas.alpha_composite(rot, (ox, oy))
    m1 = phone_mask(rot, ox, oy, CW, H)

    # ---- 2번 폰: 반대(반시계)로 살짝. 1번 폰 끝자락과 여백을 두고, 아래는 조금(cut) 잘려도 된다 ----
    angle_r = c.get("_pano_angle_r", 3.0)
    cut = c.get("_cut_r", 0.03)
    gapx = round(50 * s)
    right_lim = CW - round(50 * s)
    # 1번 폰이 2번 장에서 줄마다 차지하는 오른쪽 끝 x(+여백)
    reach = np.full(H, W - 10 ** 6)
    cols = np.nonzero(m1[:, W:].any(axis=0))[0]
    if cols.size:
        sub = m1[:, W:]
        for yy in np.nonzero(sub.any(axis=1))[0]:
            reach[yy] = W + np.nonzero(sub[yy])[0][-1] + gapx
    inner_w = round(W * 0.86)
    while True:
        lay, pw, ph = phone_img(src_r, inner_w, s, shadow_alpha=0.30)
        rot2 = lay.rotate(angle_r, expand=True, resample=Image.BICUBIC)
        bx0, by0, bx1, by1 = body_bbox(rot2)
        bw, bh = bx1 - bx0, by1 - by0
        oy2 = round(top - by0)
        if top + bh * (1 - cut) > H:
            inner_w -= 6
            continue
        # 폰 몸체의 줄마다 왼쪽 끝을 구해, 1번 폰 끝자락보다 오른쪽에 오도록 가장 왼쪽(가운데 쪽) 자리를 찾는다
        al = np.array(rot2.getchannel("A")) > 200
        need = W + (W - bw) / 2 - bx0  # 2번 장 가운데에 두는 ox
        for ry in range(by0, by1):
            yy = oy2 + ry
            if 0 <= yy < H and reach[yy] > W:
                xs = np.nonzero(al[ry])[0]
                if xs.size:
                    need = max(need, reach[yy] - xs[0])
        ox2 = round(need)
        if ox2 + bx1 <= right_lim or inner_w < W * 0.4:
            break
        inner_w -= 6
    canvas.alpha_composite(rot2, (ox2, oy2))

    rgb = canvas.convert("RGB")
    rgb.crop((0, 0, W, H)).save(out_l)
    rgb.crop((W, 0, CW, H)).save(out_r)
    return rgb


def wave_band(W, H, bh, amp, phase, s, color):
    """위에서 bh 까지 색을 채우고 아랫단을 물결(사인 곡선)로."""
    import math
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    lam = W / 1.25
    pts = [(0, 0), (W, 0)]
    # 4픽셀 간격 + 맨 끝 x=0 을 꼭 넣는다(폭이 4의 배수가 아니면 왼쪽 가장자리에 틈이 생겼다)
    for x in list(range(W, 0, -4)) + [0]:
        pts.append((x, bh + amp * math.sin(2 * math.pi * x / lam + phase)))
    ImageDraw.Draw(lay).polygon(pts, fill=color)
    return lay


def make_band(c, src_img, out, W, H, idx):
    """3번부터: 위쪽 파란 물결 띠(작은 설명 + 큰 제목 2줄, 둘째 줄 노랑 강조) + 아래 똑바로 선 큰 폰."""
    s = W / 1080
    canvas = paper_bg(W, H, s)
    lines = c["title"].split("\n")
    f, size = fit_lines(lines, W - round(2 * 70 * s), 150 * s, 104 * s)
    f_sub = ImageFont.truetype(FONT, round(48 * s), index=FONT_BOLD_INDEX)
    lh = round(size * 1.2)
    asc = f.getmetrics()[0]
    y_sub = round(H * 0.052) + round(10 * s)
    y_title = y_sub + round(48 * s) + round(40 * s)
    text_bottom = y_title + lh * (len(lines) - 1) + asc + round(f.getmetrics()[1] * 0.4)
    bh = max(round(H * 0.25), text_bottom + round(60 * s))
    amp = round(26 * s)
    band = wave_band(W, H, bh, amp, idx * 1.7, s, BLUE + (255,))
    # 띠 아래 아주 옅은 그림자(종이 위에 놓인 느낌)
    sh = wave_band(W, H, bh + round(8 * s), amp, idx * 1.7, s, (0, 0, 0, 40)).filter(ImageFilter.GaussianBlur(round(10 * s)))
    canvas.alpha_composite(sh)
    canvas.alpha_composite(band)
    d = ImageDraw.Draw(canvas)
    d.text((W / 2, y_sub), c["sub"], font=f_sub, fill=(255, 255, 255, 225), anchor="mt")
    y = y_title + asc
    for ln in lines:
        draw_line(canvas, parse_runs(ln), f, W / 2, y, (255, 255, 255), YELLOW, align="center")
        y += lh
    # 폰: 띠 아래에 크게. 아래는 화면 밖으로 조금(폰 높이의 cut 만큼) 잘려도 된다
    top = bh + amp + round(H * 0.03)
    cut = c.get("_cut", 0.012)  # 아래 마이크 버튼이 잘리지 않을 만큼만
    box = c.get("_box")  # 잘라 낸 위젯 장면: 조금 더 넓게, 띠 아래 남은 자리 가운데에
    inner_w = round(W * (0.88 if box else 0.82))
    while True:
        inner_h = src_img.height * inner_w / src_img.width
        if top + inner_h * (1 - cut) <= H or inner_w < W * 0.5:
            break
        inner_w -= 4
    ph_img, pw, ph = phone_img(src_img, inner_w, s, shadow_alpha=0.22)
    pad = (ph_img.width - pw) // 2
    if box:
        top = max(top, round(top + (H - top - ph) / 2 - 20 * s))  # 그림자 몫만큼 살짝 위로
    canvas.alpha_composite(ph_img, (round(W / 2 - ph_img.width / 2), round(top - pad)))
    canvas.convert("RGB").save(out)


def make_bold_set(copy, a, W, H, root):
    """bold 스타일 전체: 파노라마 2장(1 말하기 + 2 녹음) + 물결 띠 장들. 번호는 01부터.
    출력 폴더의 옛 bold 출력(NN-*.png)은 지우고 새로 만든다."""
    import glob
    ios = a.platform == "ios"
    cfg = copy["bold"]
    if a.bold_font:
        path, _, idx = a.bold_font.partition("#")
        BOLD_FONT[0], BOLD_FONT[1] = path, int(idx or 0)
    pj = lambda p: p if os.path.isabs(p) else os.path.join(root, p)
    for old in glob.glob(os.path.join(a.out, "%s[0-9][0-9]-*.png" % a.prefix)):
        os.remove(old)
    pano = cfg["pano"]
    base_l = copy["shots"][pano["shot"]]
    base_r = copy["shots"][pano["shot_r"]]
    if ios:
        # App Store: 아이폰 캡처만. 말하기 화면은 pano.src_ios 로 지정(없으면 임시 화면)
        cl = dict(base_l, src=pj(pano["src_ios"]))
        cr = dict(base_r, src=pj(base_r["src_ios"]))
        src_l, src_r = crop_src(cl, False), crop_src(cr, False)
    else:
        cl = dict(base_l, src=pj(base_l["src"]))
        cr = dict(base_r, src=pj(base_r["src"]))
        src_l, src_r = crop_src(cl, True), crop_src(cr, True)
    c = {"title": pano["title"], "sub": pano["sub"],
         "title_r": pano.get("title_r", base_r["title"]), "sub_r": pano.get("sub_r", base_r["sub"]),
         "_pano_angle": a.pano_angle if a.pano_angle is not None else -9.0,
         "_pano_over": a.pano_over,
         # 아이폰 녹음 상세 캡처는 아래가 비어 있어 더 잘려도 된다
         "_cut_r": 0.06 if ios else 0.03}
    l = os.path.join(a.out, "%s01-%s.png" % (a.prefix, base_l["slug"]))
    r = os.path.join(a.out, "%s02-%s.png" % (a.prefix, base_r["slug"]))
    make_pano(c, src_l, src_r, l, r, W, H, a.pano_bg)
    print("만듦:", l)
    print("만듦:", r)
    n = 2
    for name in cfg["ios" if ios else "play"]:
        shot = copy["shots"][name]
        key = "src_ios" if ios else "src"
        if not shot.get(key):
            print("건너뜀(원본 없음):", name)
            continue
        n += 1
        # 아래 잘림: 안드로이드 캡처는 마이크 버튼이 잘라 낸 화면의 맨 아래(약 99%)까지 내려와 있어 화면 끝까지 보이게(-1.2%),
        # 아이폰 캡처는 마이크가 약 95% 위치라 조금(1.2%) 잘려도 된다
        c = dict(shot, src=pj(shot[key]), _cut=0.012 if ios else -0.012)
        box = shot.get("bold_box_ios" if ios else "bold_box")
        if box:
            # 이 장만: [왼, 위, 오른, 아래] 픽셀 상자만 잘라 폰 화면에 넣는다(위젯 장면처럼 일부만 크게 보일 때).
            # 폰 틀은 잘라 낸 그림 비율을 그대로 따른다. 상자가 없는 장은 예전과 똑같다
            img = open_src(c["src"]).crop(tuple(box))
            c["_cut"] = 0.0  # 잘라 낸 그림은 아래까지 다 보이게
            c["_box"] = True
        else:
            img = crop_src(c, not ios)  # iOS 캡처는 상태 표시줄을 그대로 둔다
        out = os.path.join(a.out, "%s%02d-%s.png" % (a.prefix, n, c["slug"]))
        make_band(c, img, out, W, H, n)
        print("만듦:", out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default=".", help="원본 캡처 폴더(src 가 없는 장만 쓴다)")
    ap.add_argument("--out", required=True, help="출력 폴더")
    ap.add_argument("--size", default="1080x1920", help="캔버스 WxH")
    ap.add_argument("--copy", default=os.path.join(os.path.dirname(__file__), "store-shot-copy.json"))
    ap.add_argument("--lang", default="ko")
    ap.add_argument("--style", default="plain", choices=["plain", "photo", "collage", "memo", "deep", "bold"],
                    help="plain=종이색 바탕(기본), photo=사진 배경, collage=폴라로이드 콜라주, deep=깊은 색, "
                         "bold=큰 글자+1·2번 이어지는 파노라마(두 장 모두 제목+폰)+물결 색 띠(구성은 JSON 의 bold)")
    ap.add_argument("--ios", action="store_true", help="shots 항목의 ios_src 가 있으면 그 파일 이름으로 원본을 읽는다(Play 와 다른 캡처 이름)")
    ap.add_argument("--prefix", default="", help="출력 파일 이름 앞에 붙일 글자(시안 비교용, 예: ga-)")
    ap.add_argument("--strip-bars", action="store_true", help="shots 항목의 crop=[위,아래] 로 안드로이드 상태 표시줄·내비게이션 바를 잘라 낸다(App Store 용)")
    ap.add_argument("--pwfrac", type=float, default=0.64, help="폰 너비 / 캔버스 폭 (memo)")
    ap.add_argument("--only", default="", help="쉼표로 나눈 원본 파일명만 만든다(시안용)")
    ap.add_argument("--platform", default="play", choices=["play", "ios"],
                    help="ios = App Store 용: shots 의 src_ios(아이폰 시뮬레이터 캡처)만 쓰고, src_ios 가 없는 장은 빼고 "
                         "번호를 01부터 이어 붙인다. 소품은 폰 앞에 크게. 상태 표시줄은 그대로 둔다(crop 무시)")
    ap.add_argument("--pano-bg", default="blue", choices=["blue", "paper"], help="bold 파노라마 바탕색")
    ap.add_argument("--pano-over", type=float, default=0.15, help="bold 1번 폰이 2번으로 넘어가는 몫(회전한 폰 폭 기준, 0.10~0.20)")
    ap.add_argument("--pano-angle", type=float, default=None, help="bold 1번 폰 기울기(음수=시계 방향, 기본 -9)")
    ap.add_argument("--bold-font", default="", help="bold 큰 글 글꼴 '경로#인덱스'(기본 산돌고딕 Neo Heavy)")
    a = ap.parse_args()
    W, H = map(int, a.size.lower().split("x"))
    copy = json.load(open(a.copy, encoding="utf-8"))[a.lang]
    os.makedirs(a.out, exist_ok=True)
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if a.style == "bold":
        make_bold_set(copy, a, W, H, root)
        return
    ios = a.platform == "ios"
    n = 0
    # order 순서대로 01, 02… 번호를 붙여 출력 이름을 정한다
    for i, name in enumerate(copy["order"], 1):
        shot = copy["shots"][name]
        if ios:
            # 아이폰 화면이 없는 장(안드로이드 캡처뿐인 장)은 App Store 에 넣지 않는다
            if not shot.get("src_ios"):
                print("건너뜀(아이폰 화면 없음):", name)
                continue
            n += 1
            c = dict(shot, src=shot["src_ios"], _idx=n, _strip=False, _pwfrac=a.pwfrac, _front=True)
        else:
            n = i
            c = dict(shot, _idx=i, _strip=a.strip_bars, _pwfrac=a.pwfrac)
        # src 가 있으면 그 경로(절대 경로 또는 저장소 기준)를 쓰고, 없으면 --in 폴더의 원본 이름을 쓴다
        src = os.path.join(root, c["src"]) if c.get("src") \
            else os.path.join(a.inp, c.get("ios_src", name) if a.ios else name)
        if not os.path.exists(src):
            print("건너뜀(원본 없음):", name)
            continue
        if a.only and name not in a.only.split(","):
            continue
        out = os.path.join(a.out, "%s%02d-%s.png" % (a.prefix, n, c["slug"]))
        if a.style == "plain":
            make(src, out, W, H, c["title"], c["sub"])
        else:
            make_styled(a.style, src, out, W, H, c)
        print("만듦:", out)

if __name__ == "__main__":
    main()
