// ─── 알람 소리 고르기(1.2.0) 문구 (키 = 한국어 원문) ─────────────────────────────
// en.ts와 dicts.ts가 언어별로 합친다. 새 문구는 8개 언어 모두에 넣을 것(i18nParity 테스트가 잡는다).
// 소리 이름 표는 lib/alarmSounds.ts SOUND_LABEL.
import type { Lang } from './lang';

type D = Record<string, string>;

/** 설명서 문단(키) — helpContent.ts와 같은 글이어야 한다 */
export const HELP_SOUND = '알람 소리: 설정 › 알람 › "🎵 기본 알람 소리"에서 고른 소리가 모든 일정에 쓰입니다(처음에는 세이람 기본음). 일정마다 다른 소리를 쓰려면 일정 화면의 알림 칩을 누르고 "🎵 알람 소리" 줄에서 고르세요. 줄을 누르면 3초 들려줍니다. "기본"으로 둔 일정은 설정을 바꾸면 새 소리로 울리고, 따로 고른 일정은 그대로입니다. 진동만 고른 일정은 소리가 나지 않습니다.';

const en: D = {
  '세이람 기본음': 'SayRam classic',
  '디지털 비프': 'Digital Beep',
  '종소리 행진': 'Bell March',
  '옛날 자명종': 'Old Alarm Clock',
  '마림바': 'Marimba',
  '잔잔한 피아노': 'Gentle Piano',
  '오르골 왈츠': 'Music Box Waltz',
  '기본': 'Default',
  '설정: {name}': 'Settings: {name}',
  '🎵 알람 소리': '🎵 Alarm sound',
  '🎵 기본 알람 소리': '🎵 Default alarm sound',
  '기본 알람 소리': 'Default alarm sound',
  '줄을 누르면 고르면서 3초 들려줘요(무음 모드면 안 들려요).': 'Tap a row to choose it and hear 3 seconds (silent in silent mode).',
  "기본 소리를 바꾸면 '기본'으로 둔 일정이 모두 새 소리로 울려요. 따로 고른 일정은 그대로예요.": 'Changing it makes every schedule set to "Default" ring with the new sound. Schedules with their own sound stay as they are.',
  [HELP_SOUND]: 'Alarm sound: the sound chosen in Settings › Alarm › "🎵 Default alarm sound" is used for every schedule (SayRam classic at first). To use a different sound for one schedule, tap its alarm chip on the schedule screen and choose it in the "🎵 Alarm sound" row. Tapping a row plays 3 seconds. Schedules left on "Default" follow the setting when you change it; schedules with their own sound keep it. Vibrate-only schedules make no sound.',
};

const ja: D = {
  '세이람 기본음': 'SayRam 標準',
  '디지털 비프': 'デジタルビープ',
  '종소리 행진': 'ベルマーチ',
  '옛날 자명종': '昔の目覚まし時計',
  '마림바': 'マリンバ',
  '잔잔한 피아노': 'やさしいピアノ',
  '오르골 왈츠': 'オルゴールワルツ',
  '기본': '標準',
  '설정: {name}': '設定: {name}',
  '🎵 알람 소리': '🎵 アラーム音',
  '🎵 기본 알람 소리': '🎵 標準のアラーム音',
  '기본 알람 소리': '標準のアラーム音',
  '줄을 누르면 고르면서 3초 들려줘요(무음 모드면 안 들려요).': '行をタップすると選びながら3秒再生します(マナーモードでは鳴りません)。',
  "기본 소리를 바꾸면 '기본'으로 둔 일정이 모두 새 소리로 울려요. 따로 고른 일정은 그대로예요.": '変更すると「標準」のままの予定はすべて新しい音で鳴ります。個別に選んだ予定はそのままです。',
  [HELP_SOUND]: 'アラーム音: 設定 › アラーム › 「🎵 標準のアラーム音」で選んだ音がすべての予定に使われます(最初は SayRam 標準)。予定ごとに変えるには、予定画面の通知チップをタップし「🎵 アラーム音」の行で選びます。行をタップすると3秒再生します。「標準」のままの予定は設定を変えると新しい音で鳴り、個別に選んだ予定はそのままです。バイブのみの予定は音が鳴りません。',
};

const zhHans: D = {
  '세이람 기본음': 'SayRam 默认铃声',
  '디지털 비프': '数字哔声',
  '종소리 행진': '钟声进行曲',
  '옛날 자명종': '老式闹钟',
  '마림바': '马林巴',
  '잔잔한 피아노': '轻柔钢琴',
  '오르골 왈츠': '八音盒华尔兹',
  '기본': '默认',
  '설정: {name}': '设置: {name}',
  '🎵 알람 소리': '🎵 闹钟铃声',
  '🎵 기본 알람 소리': '🎵 默认闹钟铃声',
  '기본 알람 소리': '默认闹钟铃声',
  '줄을 누르면 고르면서 3초 들려줘요(무음 모드면 안 들려요).': '点一行即可选中并试听 3 秒(静音模式下听不到)。',
  "기본 소리를 바꾸면 '기본'으로 둔 일정이 모두 새 소리로 울려요. 따로 고른 일정은 그대로예요.": '更改后,所有设为“默认”的日程都会用新铃声响起。单独选择了铃声的日程保持不变。',
  [HELP_SOUND]: '闹钟铃声: 在 设置 › 闹钟 › “🎵 默认闹钟铃声” 中选择的铃声会用于所有日程(初始为 SayRam 默认铃声)。如需为某个日程换铃声,请在日程页面点提醒标签,在“🎵 闹钟铃声”一行中选择。点一行会试听 3 秒。设为“默认”的日程会随设置更改而使用新铃声,单独选择的日程保持不变。仅振动的日程不会发出声音。',
};

const zhHant: D = {
  '세이람 기본음': 'SayRam 預設鈴聲',
  '디지털 비프': '數位嗶聲',
  '종소리 행진': '鐘聲進行曲',
  '옛날 자명종': '老式鬧鐘',
  '마림바': '馬林巴',
  '잔잔한 피아노': '輕柔鋼琴',
  '오르골 왈츠': '音樂盒華爾滋',
  '기본': '預設',
  '설정: {name}': '設定: {name}',
  '🎵 알람 소리': '🎵 鬧鐘鈴聲',
  '🎵 기본 알람 소리': '🎵 預設鬧鐘鈴聲',
  '기본 알람 소리': '預設鬧鐘鈴聲',
  '줄을 누르면 고르면서 3초 들려줘요(무음 모드면 안 들려요).': '點一行即可選取並試聽 3 秒(靜音模式下聽不到)。',
  "기본 소리를 바꾸면 '기본'으로 둔 일정이 모두 새 소리로 울려요. 따로 고른 일정은 그대로예요.": '變更後,所有設為「預設」的行程都會以新鈴聲響起。個別選了鈴聲的行程維持不變。',
  [HELP_SOUND]: '鬧鐘鈴聲: 在 設定 › 鬧鐘 › 「🎵 預設鬧鐘鈴聲」中選的鈴聲會用於所有行程(一開始是 SayRam 預設鈴聲)。若要讓某個行程用不同鈴聲,請在行程畫面點提醒標籤,在「🎵 鬧鐘鈴聲」一行中選擇。點一行會試聽 3 秒。設為「預設」的行程會隨設定變更改用新鈴聲,個別選的行程維持不變。僅震動的行程不會發出聲音。',
};

const es: D = {
  '세이람 기본음': 'SayRam clásico',
  '디지털 비프': 'Pitido digital',
  '종소리 행진': 'Marcha de campanas',
  '옛날 자명종': 'Despertador antiguo',
  '마림바': 'Marimba',
  '잔잔한 피아노': 'Piano suave',
  '오르골 왈츠': 'Vals de caja de música',
  '기본': 'Predeterminado',
  '설정: {name}': 'Ajustes: {name}',
  '🎵 알람 소리': '🎵 Sonido de alarma',
  '🎵 기본 알람 소리': '🎵 Sonido de alarma predeterminado',
  '기본 알람 소리': 'Sonido de alarma predeterminado',
  '줄을 누르면 고르면서 3초 들려줘요(무음 모드면 안 들려요).': 'Toca una fila para elegirla y oír 3 segundos (no suena en modo silencio).',
  "기본 소리를 바꾸면 '기본'으로 둔 일정이 모두 새 소리로 울려요. 따로 고른 일정은 그대로예요.": 'Al cambiarlo, todos los eventos en «Predeterminado» sonarán con el nuevo sonido. Los que tienen su propio sonido no cambian.',
  [HELP_SOUND]: 'Sonido de alarma: el sonido elegido en Ajustes › Alarma › «🎵 Sonido de alarma predeterminado» se usa en todos los eventos (al principio, SayRam clásico). Para usar otro en un evento, toca su chip de alarma en la pantalla del evento y elígelo en la fila «🎵 Sonido de alarma». Al tocar una fila suenan 3 segundos. Los eventos en «Predeterminado» siguen el ajuste cuando lo cambias; los que tienen su propio sonido lo conservan. Los eventos solo con vibración no suenan.',
};

const fr: D = {
  '세이람 기본음': 'SayRam classique',
  '디지털 비프': 'Bip numérique',
  '종소리 행진': 'Marche des cloches',
  '옛날 자명종': 'Vieux réveil',
  '마림바': 'Marimba',
  '잔잔한 피아노': 'Piano doux',
  '오르골 왈츠': 'Valse de boîte à musique',
  '기본': 'Par défaut',
  '설정: {name}': 'Réglages : {name}',
  '🎵 알람 소리': '🎵 Son de l’alarme',
  '🎵 기본 알람 소리': '🎵 Son d’alarme par défaut',
  '기본 알람 소리': 'Son d’alarme par défaut',
  '줄을 누르면 고르면서 3초 들려줘요(무음 모드면 안 들려요).': 'Touchez une ligne pour la choisir et écouter 3 secondes (muet en mode silencieux).',
  "기본 소리를 바꾸면 '기본'으로 둔 일정이 모두 새 소리로 울려요. 따로 고른 일정은 그대로예요.": 'En le changeant, tous les événements laissés sur « Par défaut » sonneront avec le nouveau son. Ceux qui ont leur propre son ne changent pas.',
  [HELP_SOUND]: 'Son de l’alarme : le son choisi dans Réglages › Alarme › « 🎵 Son d’alarme par défaut » sert à tous les événements (au départ, SayRam classique). Pour un autre son sur un événement, touchez sa puce d’alarme sur l’écran de l’événement et choisissez-le dans la ligne « 🎵 Son de l’alarme ». Toucher une ligne joue 3 secondes. Les événements sur « Par défaut » suivent le réglage quand vous le changez ; ceux qui ont leur propre son le gardent. Les événements en vibration seule ne sonnent pas.',
};

const de: D = {
  '세이람 기본음': 'SayRam Klassik',
  '디지털 비프': 'Digitaler Piepton',
  '종소리 행진': 'Glockenmarsch',
  '옛날 자명종': 'Alter Wecker',
  '마림바': 'Marimba',
  '잔잔한 피아노': 'Sanftes Klavier',
  '오르골 왈츠': 'Spieluhr-Walzer',
  '기본': 'Standard',
  '설정: {name}': 'Einstellung: {name}',
  '🎵 알람 소리': '🎵 Weckton',
  '🎵 기본 알람 소리': '🎵 Standard-Weckton',
  '기본 알람 소리': 'Standard-Weckton',
  '줄을 누르면 고르면서 3초 들려줘요(무음 모드면 안 들려요).': 'Tippe auf eine Zeile, um sie zu wählen und 3 Sekunden zu hören (im Lautlos-Modus stumm).',
  "기본 소리를 바꾸면 '기본'으로 둔 일정이 모두 새 소리로 울려요. 따로 고른 일정은 그대로예요.": 'Änderst du ihn, klingeln alle Termine auf „Standard“ mit dem neuen Ton. Termine mit eigenem Ton bleiben, wie sie sind.',
  [HELP_SOUND]: 'Weckton: Der in Einstellungen › Alarm › „🎵 Standard-Weckton“ gewählte Ton gilt für alle Termine (anfangs SayRam Klassik). Für einen anderen Ton bei einem Termin tippe auf dem Terminbildschirm auf seinen Alarm-Chip und wähle ihn in der Zeile „🎵 Weckton“. Ein Tipp auf eine Zeile spielt 3 Sekunden. Termine auf „Standard“ folgen der Einstellung, wenn du sie änderst; Termine mit eigenem Ton behalten ihn. Termine nur mit Vibration klingeln nicht.',
};

const pt: D = {
  '세이람 기본음': 'SayRam clássico',
  '디지털 비프': 'Bipe digital',
  '종소리 행진': 'Marcha dos sinos',
  '옛날 자명종': 'Despertador antigo',
  '마림바': 'Marimba',
  '잔잔한 피아노': 'Piano suave',
  '오르골 왈츠': 'Valsa da caixinha de música',
  '기본': 'Padrão',
  '설정: {name}': 'Configurações: {name}',
  '🎵 알람 소리': '🎵 Som do alarme',
  '🎵 기본 알람 소리': '🎵 Som de alarme padrão',
  '기본 알람 소리': 'Som de alarme padrão',
  '줄을 누르면 고르면서 3초 들려줘요(무음 모드면 안 들려요).': 'Toque numa linha para escolhê-la e ouvir 3 segundos (sem som no modo silencioso).',
  "기본 소리를 바꾸면 '기본'으로 둔 일정이 모두 새 소리로 울려요. 따로 고른 일정은 그대로예요.": 'Ao mudar, todos os eventos em “Padrão” tocam com o novo som. Os que têm som próprio continuam iguais.',
  [HELP_SOUND]: 'Som do alarme: o som escolhido em Configurações › Alarme › “🎵 Som de alarme padrão” vale para todos os eventos (no início, SayRam clássico). Para outro som num evento, toque no chip de alarme na tela do evento e escolha na linha “🎵 Som do alarme”. Tocar numa linha toca 3 segundos. Eventos em “Padrão” seguem o ajuste quando você o muda; os que têm som próprio o mantêm. Eventos só com vibração não tocam som.',
};

export const SOUND_DICTS: Record<Exclude<Lang, 'ko'>, D> = { en, ja, 'zh-Hans': zhHans, 'zh-Hant': zhHant, es, fr, de, pt };
