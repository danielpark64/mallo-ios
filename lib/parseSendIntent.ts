// ─── 말로 보내기: "내일 3시 병원, 엄마한테 보내줘" → 받는 사람 "엄마" + 남은 말 "내일 3시 병원" ─────────
// 문장 **끝**의 부탁(명령)형만 본다. "팀장님께 메일 보내기"처럼 할 일 자체가 '보내기'인 일정은 건드리지 않는다:
//   - 받는 사람 바로 뒤에 '보내'가 와야 한다(사이에 '메일' 같은 목적어가 있으면 할 일로 본다)
//   - 부탁형 어미(보내줘·보내 주세요·send it to …)일 때만
// 뽑은 구절은 일정 내용에서 뺀다(parseSchedule이 남은 말만 날짜·내용으로 읽는다).
import type { Lang } from './i18n/lang';

export type SendIntent = { text: string; sendTo: string | null };

const NONE = (text: string): SendIntent => ({ text, sendTo: null });

/** 라틴 글자 이름(악센트 포함) — \p{L}은 Hermes에서 확실하지 않아 범위로 쓴다 */
const LATIN = "A-Za-zÀ-ÖØ-öø-ÿ";
const LNAME = `[${LATIN}][${LATIN}'’\\-]*(?:\\s+[A-ZÀ-ÖØ-Þ][${LATIN}'’\\-]*)?`;
const END = `\\s*[.!?。！？]*\\s*$`;

function finish(text: string, start: number, name: string): SendIntent {
  const rest = text.slice(0, start).replace(/[\s,，、;:·\-–—]+$/u, '').trim();
  const to = name.replace(/\s+/g, ' ').trim();
  return to ? { text: rest, sendTo: to } : NONE(text);
}

// ── 한국어 ──────────────────────────────────────────────────────────────────────
// [이거·이 일정(을)] 엄마(한테|에게|께)(도) [이거(를)] (보내|전해|공유해)(줘|주세요|줄래|드려…)
// '알려줘'·'전달해줘'는 쓰지 않는다 — "나한테 알려줘"처럼 알람 부탁으로 더 자주 쓴다.
const KO_OBJ = '(?:(?:이거|이것|이\\s*일정|일정|이\\s*약속)\\s*(?:을|를)?\\s*)?';
const KO_RE = new RegExp(
  `(^|[\\s,，、])(${KO_OBJ})([가-힣A-Za-z0-9]{1,10}?)\\s*(?:한테|에게|께|한테로)\\s*도?\\s*${KO_OBJ}` +
    `(?:보내|전해|공유해)\\s*(?:줘요|줘|주세요|줄래요|줄래|주라|드려요|드려\\s*줘|드려|드리세요|주실래요)` +
    END,
);
/** 1인칭 — 나한테·저한테는 보내기가 아니다(알람 부탁) */
const KO_SELF = new Set(['나', '저', '내', '제', '우리', '저희', '나자신', '자신', '본인']);
/** 받는 사람 바로 앞에 오면 그 사물을 보내는 할 일로 본다("회의 자료 팀장님께 보내줘") */
const KO_THING = /(?:자료|파일|메일|이메일|문서|사진|서류|보고서|링크|영상|동영상|메시지|문자|택배|선물|견적서|계약서|초대장|청첩장|티켓|주소|번호)$/;
/** 흔한 호칭 — "병원엄마"처럼 앞말과 붙어 있으면 어디까지가 이름인지 애매하다 */
const KO_KIN = /(?:엄마|아빠|어머니|아버지|어머님|아버님|할머니|할아버지|언니|오빠|누나|형|동생|이모|고모|삼촌|부장님|팀장님|과장님|선생님|교수님|사장님)$/;
/** 호칭 앞에 붙어도 이름의 일부인 말(큰엄마·외할머니·막내동생…) */
const KO_KIN_OK = /^(?:큰|작은|외|친|시|새|막내|첫째|둘째|셋째|남|여|우리|김|이|박|최|정|강|조|윤|장|임|한|오|서|신|권|황|안|송|류|홍)$/;
function ko(text: string): SendIntent {
  const m = KO_RE.exec(text);
  if (!m) return NONE(text);
  const [, sep, obj, name] = m;
  if (KO_SELF.has(name)) return NONE(text);
  // 이름이 호칭으로 끝나는데 앞에 붙은 말이 호칭의 일부가 아니면("병원엄마") 애매 → 보내기 아님
  const kin = KO_KIN.exec(name);
  if (kin && kin.index > 0 && !KO_KIN_OK.test(name.slice(0, kin.index))) return NONE(text);
  const start = m.index + sep.length;
  if (!obj) {
    // 받는 사람 바로 앞 낱말이 목적어(…을/를, 자료·파일 등)면 그것을 보내는 할 일이다
    const prev = text.slice(0, start).replace(/[\s,，、]+$/u, '').split(/[\s,，、]+/).pop() ?? '';
    if (/[을를]$/.test(prev) || KO_THING.test(prev)) return NONE(text);
  }
  return finish(text, start, name);
}

// ── 영어 ────────────────────────────────────────────────────────────────────────
// (and) (please) send|share|forward (it|this|that) to (my) Mom (please)
const EN_RE = new RegExp(
  `(?:^|[\\s,])(?:and\\s+|then\\s+)?(?:please\\s+)?(?:send|share|forward|text)\\s+(?:it\\s+|this\\s+|that\\s+|this\\s+one\\s+)?(?:over\\s+)?(?:to|with)\\s+(?:my\\s+)?(${LNAME})(?:\\s*,?\\s*please)?${END}`,
  'i',
);
function en(text: string): SendIntent {
  return latin(EN_RE)(text);
}

// ── 일본어 ──────────────────────────────────────────────────────────────────────
// (これ(を)) 母に (これを) 送って|送信して|共有して|伝えて (ください|ね)
const JA_TRIGGER = /に\s*(?:これを?|この予定を?|それを?)?\s*(?:送って|送信して|共有して|伝えて|送っといて|送っておいて)\s*(?:ください|下さい|くれる|くれ|ね|よ|おいて)?\s*[。.!！?？]*\s*$/;
/** 흔한 받는 사람(가족) — 앞말과 붙어 있어도 이것으로 끝나면 이것만 이름으로 */
const JA_KIN = ['お母さん', 'おかあさん', 'お父さん', 'おとうさん', 'おばあちゃん', 'おじいちゃん', 'お兄ちゃん', 'お姉ちゃん', 'ママ', 'パパ', '母', '父', '妻', '夫', '息子', '娘', '兄', '姉', '弟', '妹', '祖母', '祖父', '家族', '彼女', '彼氏'];
/** 1인칭 — 私に送って는 보내기가 아니다 */
const JA_SELF = new Set(['私', 'わたし', 'わたくし', 'あたし', '僕', 'ぼく', '俺', 'おれ', '自分', 'うち', '私たち', '僕ら', '俺たち']);
const JA_THING = /(?:資料|ファイル|メール|書類|写真|文書|データ|荷物|リンク|動画|画像)$/;
function ja(text: string): SendIntent {
  const m = JA_TRIGGER.exec(text);
  if (!m) return NONE(text);
  const before = text.slice(0, m.index);
  // 이름 후보: 끝에서부터 구두점·띄어쓰기·숫자 전까지(최대 8글자)
  const cand = /([^\s、,，。.!！?？0-9０-９]{1,8})$/.exec(before);
  if (!cand) return NONE(text);
  let name = cand[1].replace(/^(?:これ|それ|この予定)を?/, '');
  const kin = JA_KIN.find((k) => name.endsWith(k));
  if (kin) name = kin;
  else {
    // 앞말과 이어진 조사(で·を·が·は·へ) 뒤만 이름으로
    const cut = Math.max(name.lastIndexOf('で'), name.lastIndexOf('を'), name.lastIndexOf('が'), name.lastIndexOf('は'), name.lastIndexOf('へ'));
    if (cut >= 0 && cut < name.length - 1) name = name.slice(cut + 1);
  }
  if (!name || JA_SELF.has(name)) return NONE(text);
  // 받는 사람 바로 앞이 목적어(…を, 資料·ファイル 등)면 그것을 보내는 할 일이다("資料を部長に送って")
  const prev = before.slice(0, before.length - name.length).replace(/[\s、,，]+$/, '');
  if (/を$/.test(prev) || JA_THING.test(prev)) return NONE(text);
  return finish(text, before.length - name.length, name);
}

// ── 중국어(간체·번체) ───────────────────────────────────────────────────────────
// (把这个) 发给|传给|分享给|转给 妈妈 (吧) / 给妈妈发过去
const ZH_VERB = '(?:发给|發給|传给|傳給|分享给|分享給|转给|轉給|发送给|發送給)';
const ZH_RE1 = new RegExp(`(?:把(?:这个|這個|它|这条|這條|这个日程|這個日程)\\s*)?${ZH_VERB}\\s*([^\\s，,。.!！?？]{1,8}?)\\s*(?:吧|一下|哦|啊)?\\s*[。.!！?？]*\\s*$`);
const ZH_RE2 = /(?:把(?:这个|這個|它)\s*)?给\s*([^\s，,。.!！?？给給]{1,8}?)\s*(?:发过去|發過去|发一下|發一下|发|發)\s*(?:吧)?\s*[。.!！?？]*\s*$/;
/** 1인칭 — 发给我는 보내기가 아니다 */
const ZH_SELF = new Set(['我', '我们', '我們', '自己', '咱们', '咱們']);
const ZH_THING = /(?:文件|资料|資料|邮件|郵件|照片|文档|文檔|材料|图片|圖片|链接|鏈接|視頻|视频)$/;
function zh(text: string): SendIntent {
  for (const re of [ZH_RE1, ZH_RE2]) {
    const m = re.exec(text);
    if (!m) continue;
    // "把文件发给妈妈"처럼 다른 목적어가 있으면 할 일로 본다
    const before = text.slice(0, m.index);
    if (/把[^\s，,。]*$/.test(before)) return NONE(text);
    if (ZH_SELF.has(m[1]) || ZH_THING.test(before.replace(/[\s，,、]+$/, ''))) return NONE(text);
    return finish(text, m.index, m[1]);
  }
  return NONE(text);
}

// ── 스페인어 ────────────────────────────────────────────────────────────────────
// (y) envíaselo|mándaselo|envíalo|compártelo|enviar a|con (mi) mamá (por favor)
const ES_RE = new RegExp(
  `(?:^|[\\s,])(?:y\\s+)?(?:por\\s+favor\\s+)?(?:env[ií]a(?:selo|sela|lo|la|le)?|m[aá]nda(?:selo|sela|lo|la|le)?|comp[aá]rte(?:lo|la)|enviar(?:lo|la|selo)?|mandar(?:lo|la|selo)?|compartir(?:lo)?)\\s+(?:a|con|para)\\s+(?:mi\\s+)?(${LNAME})(?:\\s*,?\\s*por\\s+favor)?${END}`,
  'i',
);
// ── 프랑스어 ────────────────────────────────────────────────────────────────────
// (et) envoie-le|envoie ça|envoyer|partage à|avec (ma|mon) maman (s'il te plaît)
const FR_RE = new RegExp(
  `(?:^|[\\s,])(?:et\\s+)?(?:envoie|envoies|envoyez|envoyer|partage|partagez|partager|transmets|transmettez)(?:-le|-la|-les|-lui|-moi)?\\s+(?:le\\s+|la\\s+|ça\\s+|ca\\s+|cela\\s+)?(?:à|a|avec)\\s+(?:ma\\s+|mon\\s+)?(${LNAME})(?:\\s*,?\\s*s'il\\s+(?:te|vous)\\s+pla[iî]t)?${END}`,
  'i',
);
// ── 독일어 ──────────────────────────────────────────────────────────────────────
// (und) schick(e)|sende|teile|leite (es|das) (an|mit|zu) (meine|meinen|meinem) Mama (weiter) (bitte)
const DE_RE = new RegExp(
  `(?:^|[\\s,])(?:und\\s+)?(?:bitte\\s+)?(?:schick|schicke|sende|send|teile|teil|leite)\\s+(?:es\\s+|das\\s+)?(?:bitte\\s+)?(?:an\\s+|mit\\s+|zu\\s+)?(?:meine\\s+|meinen\\s+|meinem\\s+|meiner\\s+)?(${LNAME})(?:\\s+weiter)?(?:\\s*,?\\s*bitte)?${END}`,
  'i',
);
// ── 포르투갈어 ──────────────────────────────────────────────────────────────────
// (e) manda|mande|envia|envie|compartilha (isso) para|pra|pro (a|o) (minha|meu) mãe (por favor)
const PT_RE = new RegExp(
  `(?:^|[\\s,])(?:e\\s+)?(?:por\\s+favor\\s+)?(?:manda|mande|mandar|envia|envie|enviar|compartilha|compartilhe|compartilhar)(?:-o|-a|-lo|-la)?\\s+(?:isso\\s+|isto\\s+)?(?:para|pra|pro|ao|à|a)\\s+(?:a\\s+|o\\s+)?(?:minha\\s+|meu\\s+)?(${LNAME})(?:\\s*,?\\s*por\\s+favor)?${END}`,
  'i',
);
/** 독일어 "schick es"에서 'es'가 이름으로 잡히지 않게, 이름으로 쓸 수 없는 낱말 */
// 1인칭(me·myself·us·mir·uns·moi·nous·mí·conmigo·mim·nós…)은 보내기가 아니다
const NOT_NAME = new Set([
  'es', 'das', 'it', 'this', 'that', 'bitte', 'please', 'por', 'favor', 'weiter', 'plz',
  'me', 'myself', 'us', 'ourselves', 'mir', 'mich', 'uns', 'selbst', 'moi', 'nous', 'moi-même',
  'mí', 'mi', 'conmigo', 'nosotros', 'nosotras', 'mim', 'nós', 'nos', 'comigo', 'eu',
]);

/** 'i' 플래그 때문에 "mom please"처럼 뒷말까지 이름으로 잡힐 수 있다 — 두 번째 낱말은 대문자로 시작하고 부탁말이 아닐 때만 남긴다 */
function cleanLatinName(raw: string): string {
  const [first, second] = raw.trim().split(/\s+/);
  if (!second || NOT_NAME.has(second.toLowerCase()) || second[0] === second[0].toLowerCase()) return first;
  return `${first} ${second}`;
}

function latin(re: RegExp) {
  return (text: string): SendIntent => {
    const m = re.exec(text);
    if (!m) return NONE(text);
    const name = cleanLatinName(m[1]);
    if (NOT_NAME.has(name.toLowerCase())) return NONE(text);
    return finish(text, m.index, name);
  };
}

const BY_LANG: Record<Lang, (text: string) => SendIntent> = {
  ko, en, ja, 'zh-Hans': zh, 'zh-Hant': zh,
  es: latin(ES_RE), fr: latin(FR_RE), de: latin(DE_RE), pt: latin(PT_RE),
};

/** 말 끝의 "○○한테 보내줘"를 뽑는다. 없으면 sendTo: null, text는 그대로 */
export function extractSendIntent(input: string, lang: Lang): SendIntent {
  const text = (input ?? '').trim();
  if (!text) return NONE(text);
  try {
    const r = (BY_LANG[lang] ?? ko)(text);
    // 남은 말이 없으면(받는 사람만 말함) 보내기 의도로 보지 않는다 — 일정이 없다
    return r.sendTo && r.text ? r : NONE(text);
  } catch {
    return NONE(text);
  }
}
