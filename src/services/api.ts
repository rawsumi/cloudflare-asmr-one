import { WorkItem, SearchResponse, TrackItem, FlatTrack, WorkDetail } from '../types/asmr';

export interface SupportedLanguage {
  id: string;
  label: string;
  flag: string;
  short: string;
}

export interface AsmrTag {
  id: string;
  name: string;
  jp: string;
  zh: string;
  en: string;
  emoji: string;
  category: 'Triggers' | 'Mood' | 'Character' | 'Tech' | 'NSFW' | 'Fetish';
  rating: 'sfw' | 'nsfw';
}

export const POPULAR_TAGS: AsmrTag[] = [
  // ==========================================
  // --- SFW: Triggers & Sensory Soundscapes ---
  // ==========================================
  { id: 'ear-cleaning', name: '耳かき', jp: '耳かき', zh: '掏耳', en: 'Ear Cleaning', emoji: '👂', category: 'Triggers', rating: 'sfw' },
  { id: 'whisper', name: '囁き', jp: '囁き・吐息', zh: '耳语・悄悄话', en: 'Whisper', emoji: '🤫', category: 'Triggers', rating: 'sfw' },
  { id: 'breathing', name: '吐息', jp: '吐息・息遣い', zh: '呼吸音・喘息', en: 'Breathing', emoji: '💨', category: 'Triggers', rating: 'sfw' },
  { id: 'massage', name: 'マッサージ', jp: 'マッサージ', zh: '按摩', en: 'Massage', emoji: '💆‍♀️', category: 'Triggers', rating: 'sfw' },
  { id: 'oil-massage', name: 'オイルマッサージ', jp: 'オイルマッサージ', zh: '精油按摩', en: 'Oil Massage', emoji: '🧴', category: 'Triggers', rating: 'sfw' },
  { id: 'head-spa', name: 'ヘッドスパ', jp: 'ヘッドスパ', zh: '头部水疗SPA', en: 'Head Spa', emoji: '💆', category: 'Triggers', rating: 'sfw' },
  { id: 'shampoo', name: 'シャンプー', jp: 'シャンプー', zh: '洗发・洗头', en: 'Shampoo / Hair Wash', emoji: '🫧', category: 'Triggers', rating: 'sfw' },
  { id: 'heartbeat', name: '心音', jp: '心音', zh: '心跳音', en: 'Heartbeat', emoji: '💓', category: 'Triggers', rating: 'sfw' },
  { id: 'sound-effects', name: 'オノマトペ', jp: 'オノマトペ・擬音', zh: '拟声词・音效', en: 'Sound Effects', emoji: '🔔', category: 'Triggers', rating: 'sfw' },
  { id: 'ear-blowing', name: '耳ふー', jp: '耳ふー・吐息', zh: '吹耳・吐息', en: 'Ear Blowing', emoji: '🌬️', category: 'Triggers', rating: 'sfw' },
  { id: 'tapping', name: 'タッピング', jp: 'タッピング', zh: '轻叩声', en: 'Tapping', emoji: '🖐️', category: 'Triggers', rating: 'sfw' },
  { id: 'chewing', name: '咀嚼音', jp: '咀嚼音・食べる音', zh: '咀嚼音・吃播', en: 'Eating / Chewing', emoji: '🍎', category: 'Triggers', rating: 'sfw' },
  { id: 'foam', name: '泡・炭酸', jp: '泡・炭酸・ジェル', zh: '泡沫・碳酸水', en: 'Foam & Bubbles', emoji: '🛁', category: 'Triggers', rating: 'sfw' },
  { id: 'rain', name: '雨音', jp: '雨音・環境音', zh: '雨声・自然音', en: 'Rain & Nature', emoji: '🌧️', category: 'Triggers', rating: 'sfw' },
  { id: 'water-sounds', name: '水音', jp: '水音・流水', zh: '水声・流水', en: 'Water Sounds', emoji: '💧', category: 'Triggers', rating: 'sfw' },
  { id: 'bonfire', name: '焚き火', jp: '焚き火・暖炉', zh: '篝火・壁炉', en: 'Campfire & Fireplace', emoji: '🔥', category: 'Triggers', rating: 'sfw' },
  { id: 'bonten', name: '梵天', jp: '梵天・羽毛棒', zh: '梵天・羽毛耳棒', en: 'Fluffy Earpick (Bonten)', emoji: '🪶', category: 'Triggers', rating: 'sfw' },
  { id: 'cotton-swab', name: '綿棒', jp: '綿棒・水綿棒', zh: '棉签・水棉棒', en: 'Cotton Swabs', emoji: '🥢', category: 'Triggers', rating: 'sfw' },
  { id: 'bamboo-earpick', name: '竹耳かき', jp: '竹耳かき', zh: '竹掏耳勺', en: 'Bamboo Earpick', emoji: '🎋', category: 'Triggers', rating: 'sfw' },
  { id: 'adhesive-swab', name: '粘着綿棒', jp: '粘着綿棒・ぺたぺた', zh: '粘性棉签', en: 'Adhesive Swabs', emoji: '🩹', category: 'Triggers', rating: 'sfw' },
  { id: 'slime', name: 'スライム', jp: 'スライム・ジェル', zh: '史莱姆・凝胶', en: 'Slime & Gel', emoji: '🧪', category: 'Triggers', rating: 'sfw' },
  { id: 'ice-glass', name: '氷・ガラス', jp: '氷・ガラス音', zh: '冰块・玻璃音', en: 'Ice & Glass Sounds', emoji: '🧊', category: 'Triggers', rating: 'sfw' },
  { id: 'brushing', name: 'ブラッシング', jp: 'ブラッシング・髪梳き', zh: '梳头・发刷', en: 'Hair Brushing', emoji: '🪮', category: 'Triggers', rating: 'sfw' },
  { id: 'teeth-brushing', name: '歯磨き', jp: '歯磨き', zh: '刷牙', en: 'Teeth Brushing', emoji: '🪥', category: 'Triggers', rating: 'sfw' },
  { id: 'page-turning', name: '本・紙', jp: '本・紙のめくり音', zh: '翻书・纸张声', en: 'Page Turning', emoji: '📖', category: 'Triggers', rating: 'sfw' },

  // ==========================================
  // --- SFW: Mood & Scenarios ---
  // ==========================================
  { id: 'sleep', name: '安眠', jp: '安眠・睡眠導入', zh: '助眠・催眠', en: 'Sleep Aid & Relax', emoji: '💤', category: 'Mood', rating: 'sfw' },
  { id: 'pure-love', name: '純愛', jp: '純愛・甘々', zh: '纯爱・甜蜜', en: 'Pure Love & Sweet', emoji: '💖', category: 'Mood', rating: 'sfw' },
  { id: 'pampering', name: '甘々', jp: '甘々・ご褒美', zh: '宠溺・撒娇', en: 'Pampering / Spoiling', emoji: '🍯', category: 'Mood', rating: 'sfw' },
  { id: 'co-sleeping', name: '添い寝', jp: '添い寝・同棲', zh: '陪睡・同居', en: 'Co-sleeping / Cuddle', emoji: '🛏️', category: 'Mood', rating: 'sfw' },
  { id: 'healing', name: '癒やし', jp: '癒やし', zh: '治愈', en: 'Healing', emoji: '🌿', category: 'Mood', rating: 'sfw' },
  { id: 'bath', name: 'お風呂', jp: 'お風呂・温泉', zh: '沐浴・温泉', en: 'Bath & Onsen', emoji: '♨️', category: 'Mood', rating: 'sfw' },
  { id: 'nursing', name: '看病', jp: '看病・お世話', zh: '看护・照顾', en: 'Caregiving / Nursing', emoji: '🩹', category: 'Mood', rating: 'sfw' },
  { id: 'living-together', name: '同棲', jp: '同棲・新婚', zh: '同居・新婚', en: 'Living Together', emoji: '🏠', category: 'Mood', rating: 'sfw' },
  { id: 'confession', name: '告白', jp: '告白・プロポーズ', zh: '告白・表白', en: 'Confession / Proposal', emoji: '💌', category: 'Mood', rating: 'sfw' },
  { id: 'lap-pillow', name: '膝枕', jp: '膝枕', zh: '膝枕', en: 'Lap Pillow', emoji: '🦵', category: 'Mood', rating: 'sfw' },
  { id: 'hug', name: '抱擁', jp: '抱擁・ハグ', zh: '拥抱・怀抱', en: 'Hugging / Cuddle', emoji: '🫂', category: 'Mood', rating: 'sfw' },
  { id: 'reading', name: '朗読', jp: '朗読・読み聞かせ', zh: '朗读・睡前故事', en: 'Audiobook & Reading', emoji: '📚', category: 'Mood', rating: 'sfw' },
  { id: 'bgm-study', name: '作業用BGM', jp: '勉強・作業用BGM', zh: '学习・工作BGM', en: 'Study / Working BGM', emoji: '💻', category: 'Mood', rating: 'sfw' },
  { id: 'counseling', name: 'カウンセリング', jp: '悩み相談・カウンセリング', zh: '倾诉・心理疏导', en: 'Counseling & Advice', emoji: '🛋️', category: 'Mood', rating: 'sfw' },
  { id: 'date', name: 'デート', jp: 'デート・お出かけ', zh: '约会・外出', en: 'Date & Outing', emoji: '🎡', category: 'Mood', rating: 'sfw' },
  { id: 'heartwarming', name: 'ほのぼの', jp: 'ほのぼの・日常', zh: '温馨・日常', en: 'Heartwarming / Daily', emoji: '☀️', category: 'Mood', rating: 'sfw' },

  // ==========================================
  // --- SFW: Character Archetypes ---
  // ==========================================
  { id: 'onee-san', name: 'お姉さん', jp: 'お姉さん', zh: '大姐姐', en: 'Older Sister (Onee-san)', emoji: '👩', category: 'Character', rating: 'sfw' },
  { id: 'imouto', name: '妹', jp: '妹', zh: '妹妹', en: 'Little Sister (Imouto)', emoji: '👧', category: 'Character', rating: 'sfw' },
  { id: 'childhood-friend', name: '幼馴染', jp: '幼馴染', zh: '青梅竹马', en: 'Childhood Friend', emoji: '🌸', category: 'Character', rating: 'sfw' },
  { id: 'kouhai', name: '後輩', jp: '後輩', zh: '后辈', en: 'Junior (Kouhai)', emoji: '🎀', category: 'Character', rating: 'sfw' },
  { id: 'senpai', name: '先輩', jp: '先輩', zh: '前辈', en: 'Senior (Senpai)', emoji: '💼', category: 'Character', rating: 'sfw' },
  { id: 'classmate', name: '同級生', jp: '同級生・同僚', zh: '同班同学', en: 'Classmate', emoji: '🏫', category: 'Character', rating: 'sfw' },
  { id: 'tsundere', name: 'ツンデレ', jp: 'ツンデレ', zh: '傲娇', en: 'Tsundere', emoji: '😾', category: 'Character', rating: 'sfw' },
  { id: 'kuudere', name: 'クーデレ', jp: 'クーデレ・無口', zh: '三无・无口', en: 'Kuudere / Quiet', emoji: '🧊', category: 'Character', rating: 'sfw' },
  { id: 'yandere', name: 'ヤンデレ', jp: 'ヤンデレ・独占欲', zh: '病娇・病爱', en: 'Yandere / Obsessive', emoji: '🔪', category: 'Character', rating: 'sfw' },
  { id: 'maid', name: 'メイド', jp: 'メイド・執事', zh: '女仆', en: 'Maid Servants', emoji: '🧹', category: 'Character', rating: 'sfw' },
  { id: 'mom', name: '母性', jp: '母性・ママ', zh: '母性・妈妈', en: 'Maternal / Mommy', emoji: '🤱', category: 'Character', rating: 'sfw' },
  { id: 'gyaru', name: 'ギャル', jp: 'ギャル・JK', zh: '辣妹・JK', en: 'Gyaru / Gal', emoji: '💅', category: 'Character', rating: 'sfw' },
  { id: 'jk', name: '女子校生', jp: '女子校生・JK', zh: '女高中生・JK', en: 'High School Girl (JK)', emoji: '🎒', category: 'Character', rating: 'sfw' },
  { id: 'nurse', name: '看護師', jp: '看護師・ナース', zh: '护士・白衣天使', en: 'Nurse', emoji: '💉', category: 'Character', rating: 'sfw' },
  { id: 'teacher', name: '女教師', jp: '女教師・先生', zh: '女教师・老师', en: 'Female Teacher', emoji: '👩‍🏫', category: 'Character', rating: 'sfw' },
  { id: 'boss', name: '女上司', jp: '女上司・キャリア', zh: '女上司・OL', en: 'Female Boss / OL', emoji: '👠', category: 'Character', rating: 'sfw' },
  { id: 'ojousama', name: 'お嬢様', jp: 'お嬢様・姫', zh: '大小姐・公主', en: 'Noble Girl (Ojousama)', emoji: '👑', category: 'Character', rating: 'sfw' },
  { id: 'kemomimi', name: 'ケモミミ', jp: '獣耳・ケモミミ', zh: '兽耳・兽娘', en: 'Animal Ears', emoji: '🐾', category: 'Character', rating: 'sfw' },
  { id: 'nekomimi', name: '猫耳', jp: '猫耳・にゃんこ', zh: '猫耳・猫娘', en: 'Catgirl (Nekomimi)', emoji: '🐱', category: 'Character', rating: 'sfw' },
  { id: 'foxgirl', name: '狐耳', jp: '狐耳・妖狐', zh: '狐耳・狐娘', en: 'Foxgirl (Kitsune)', emoji: '🦊', category: 'Character', rating: 'sfw' },
  { id: 'elf', name: 'エルフ', jp: 'エルフ・ハーフエルフ', zh: '精灵・半精灵', en: 'Elf', emoji: '🧝‍♀️', category: 'Character', rating: 'sfw' },
  { id: 'angel', name: '天使', jp: '天使・女神', zh: '天使・女神', en: 'Angel / Goddess', emoji: '🪽', category: 'Character', rating: 'sfw' },
  { id: 'vtuber', name: 'VTuber', jp: 'VTuber・配信者', zh: '虚拟主播・VTuber', en: 'VTuber / Streamer', emoji: '🎙️', category: 'Character', rating: 'sfw' },
  { id: 'tomboy', name: 'ボクっ娘', jp: 'ボクっ娘・ボーイッシュ', zh: '假小子・男孩子气少女', en: 'Tomboy (Bokukko)', emoji: '🧢', category: 'Character', rating: 'sfw' },
  { id: 'married-woman', name: '人妻', jp: '人妻・若妻', zh: '人妻・新妻', en: 'Married Woman', emoji: '💍', category: 'Character', rating: 'sfw' },

  // ==========================================
  // --- SFW: Audio Tech & Equipment ---
  // ==========================================
  { id: 'binaural', name: 'バイノーラル', jp: 'バイノーラル', zh: '人头双耳・双声道', en: 'Binaural Audio', emoji: '🎙️', category: 'Tech', rating: 'sfw' },
  { id: 'ku100', name: 'KU100', jp: 'KU100 (Neumann)', zh: 'KU100假头麦克风', en: 'Neumann KU100', emoji: '🎧', category: 'Tech', rating: 'sfw' },
  { id: '3dio', name: '3Dio', jp: '3Dio FreeSpace', zh: '3Dio双耳麦', en: '3Dio FreeSpace', emoji: '🎛️', category: 'Tech', rating: 'sfw' },
  { id: 'dummy-head', name: 'ダミーヘッド', jp: 'ダミーヘッドマイク', zh: '仿真假头麦克风', en: 'Dummy Head Mic', emoji: '🗣️', category: 'Tech', rating: 'sfw' },
  { id: 'hi-res', name: 'ハイレゾ', jp: 'ハイレゾ高音質', zh: 'Hi-Res高解析音质', en: 'Hi-Res Audio', emoji: '🎼', category: 'Tech', rating: 'sfw' },
  { id: 'spatial-3d', name: '立体音響', jp: '立体音響・空間オーディオ', zh: '3D空间立体环绕声', en: '3D Spatial Audio', emoji: '🔊', category: 'Tech', rating: 'sfw' },

  // ==========================================
  // --- NSFW (18+ Adult): Triggers & Actions ---
  // ==========================================
  { id: 'ear-licking', name: '耳舐め', jp: '耳舐め・リップ音', zh: '舔耳・湿吻', en: 'Ear Licking & Kiss', emoji: '👅', category: 'NSFW', rating: 'nsfw' },
  { id: 'deep-ear', name: '耳奥', jp: '耳奥・奥舐め', zh: '深入耳道・深吻耳穴', en: 'Deep Ear Canal Licking', emoji: '👂', category: 'NSFW', rating: 'nsfw' },
  { id: 'kiss-lip', name: 'キス', jp: 'キス・リップ音', zh: '湿吻・舌吻水音', en: 'Kissing & Lip Sounds', emoji: '💋', category: 'NSFW', rating: 'nsfw' },
  { id: 'masturbation-support', name: 'オナサポート', jp: 'オナサポート・誘導', zh: '手冲引导・助攻', en: 'Masturbation Support', emoji: '🔥', category: 'NSFW', rating: 'nsfw' },
  { id: 'dirty-talk', name: '淫語', jp: '淫語・喘ぎ', zh: '粗口・色气淫语', en: 'Dirty Talk', emoji: '🗯️', category: 'NSFW', rating: 'nsfw' },
  { id: 'moaning', name: '喘ぎ声', jp: '喘ぎ声・吐息', zh: '呻吟・娇喘喘息', en: 'Moaning & Panting', emoji: '😮‍💨', category: 'NSFW', rating: 'nsfw' },
  { id: 'verbal-tease', name: '言葉責め', jp: '言葉責め・罵倒', zh: '言语羞辱・挑逗', en: 'Verbal Teasing', emoji: '😈', category: 'NSFW', rating: 'nsfw' },
  { id: 'blowjob-sounds', name: 'フェラ', jp: 'フェラ・口唇音', zh: '口交・深喉吞咽', en: 'Fellatio / Oral Sounds', emoji: '👄', category: 'NSFW', rating: 'nsfw' },
  { id: 'handjob-sounds', name: '手コキ', jp: '手コキ・ローション', zh: '手交・润滑油声', en: 'Handjob & Lotion', emoji: '🧴', category: 'NSFW', rating: 'nsfw' },
  { id: 'paizuri', name: 'パイズリ', jp: 'パイズリ・挟み込み', zh: '乳交・胸部夹击', en: 'Titjob (Paizuri)', emoji: '🍈', category: 'NSFW', rating: 'nsfw' },
  { id: 'footjob', name: '足コキ', jp: '足コキ・踏みつけ', zh: '足交・踩踏', en: 'Footjob / Stomping', emoji: '🦶', category: 'NSFW', rating: 'nsfw' },
  { id: 'edging', name: '焦らし', jp: '焦らし・寸止め', zh: '挑弄・寸止', en: 'Edging & Teasing', emoji: '⏳', category: 'NSFW', rating: 'nsfw' },
  { id: 'ejaculation-control', name: '射精管理', jp: '射精管理・制限', zh: '射精管理・高潮控制', en: 'Orgasm Control', emoji: '🔒', category: 'NSFW', rating: 'nsfw' },
  { id: 'milking', name: '搾精', jp: '搾精・搾り取り', zh: '榨精・榨干', en: 'Milking / Extraction', emoji: '🥛', category: 'NSFW', rating: 'nsfw' },
  { id: 'creampie-fantasy', name: '中出し', jp: '中出し・生ハメ', zh: '内射・生肉棒', en: 'Creampie Fantasy', emoji: '💥', category: 'NSFW', rating: 'nsfw' },
  { id: 'raw-sex', name: '生ハメ', jp: '生ハメ・生挿入', zh: '无套生插', en: 'Raw Unprotected Sex', emoji: '⚡', category: 'NSFW', rating: 'nsfw' },
  { id: 'close-contact', name: '密着', jp: '密着・擦り付け', zh: '贴身・身体摩擦', en: 'Body Grinding / Contact', emoji: '🫂', category: 'NSFW', rating: 'nsfw' },
  { id: 'hypnosis', name: '催眠', jp: '催眠・暗示', zh: '催眠・洗脑', en: 'Hypnosis / Mind Control', emoji: '🌀', category: 'NSFW', rating: 'nsfw' },
  { id: 'squirting', name: '潮吹き', jp: '潮吹き・放尿', zh: '潮吹・喷水', en: 'Squirting', emoji: '💦', category: 'NSFW', rating: 'nsfw' },
  { id: 'sex-toys', name: '玩具', jp: '玩具・ローター・バイブ', zh: '跳蛋・震动棒玩具', en: 'Sex Toys & Vibrators', emoji: '🍆', category: 'NSFW', rating: 'nsfw' },

  // ==========================================
  // --- NSFW (18+ Adult): Tropes & Fetishes ---
  // ==========================================
  { id: 'sweet-sadism', name: '甘サド', jp: '甘サド・ドS', zh: '微S・甜抖S', en: 'Sweet Sadism / Dominant', emoji: '👑', category: 'Fetish', rating: 'nsfw' },
  { id: 'sadist', name: 'ドS', jp: 'ドS・サディスト', zh: '超S・抖S霸道', en: 'Dominant (Sadist)', emoji: '⛓️', category: 'Fetish', rating: 'nsfw' },
  { id: 'masochist', name: 'ドM', jp: 'ドM・マゾヒスト', zh: '抖M・受虐体质', en: 'Submissive (Masochist)', emoji: '🧎', category: 'Fetish', rating: 'nsfw' },
  { id: 'mesugaki', name: 'メスガキ', jp: 'メスガキ・ざぁこ', zh: '雌小鬼・杂鱼', en: 'Mesugaki / Brat', emoji: '💢', category: 'Fetish', rating: 'nsfw' },
  { id: 'chijo', name: '痴女', jp: '痴女・誘惑', zh: '痴女・主动诱惑', en: 'Lewd / Seductress', emoji: '👠', category: 'Fetish', rating: 'nsfw' },
  { id: 'succubus', name: 'サキュバス', jp: 'サキュバス・淫魔', zh: '魅魔・梦魔', en: 'Succubus / Demoness', emoji: '💜', category: 'Fetish', rating: 'nsfw' },
  { id: 'oppai-big', name: '巨乳', jp: '巨乳・爆乳', zh: '巨乳・丰满', en: 'Big Breasts (Kyonyuu)', emoji: '🍈', category: 'Fetish', rating: 'nsfw' },
  { id: 'oppai-flat', name: '貧乳', jp: '貧乳・微乳', zh: '贫乳・平胸', en: 'Flat Chest / Petite', emoji: '🍒', category: 'Fetish', rating: 'nsfw' },
  { id: 'butt', name: '尻', jp: '尻・ヒップ・お尻', zh: '臀部・美臀', en: 'Butt / Ass Play', emoji: '🍑', category: 'Fetish', rating: 'nsfw' },
  { id: 'anal', name: 'アナル', jp: 'アナル・アナル責め', zh: '后庭・肛交开发', en: 'Anal Play', emoji: '🍩', category: 'Fetish', rating: 'nsfw' },
  { id: 'ntr', name: '寝取られ', jp: '寝取られ・NTR', zh: '被戴绿帽・NTR', en: 'NTR / Cuckold', emoji: '💔', category: 'Fetish', rating: 'nsfw' },
  { id: 'nts', name: '寝取り', jp: '寝取り・奪う', zh: '横刀夺爱・寝取', en: 'Stealing Partner (NTS)', emoji: '🖤', category: 'Fetish', rating: 'nsfw' },
  { id: 'harem', name: 'ハーレム', jp: 'ハーレム・複数', zh: '后宫・多女侍一', en: 'Harem / Multiple CVs', emoji: '👯‍♀️', category: 'Fetish', rating: 'nsfw' },
  { id: 'threesome', name: '逆3P', jp: '逆3P・複数プレイ', zh: '双女一男・3P多女', en: 'Threesome / Multi-girl', emoji: '👭', category: 'Fetish', rating: 'nsfw' },
  { id: 'incest', name: '近親相姦', jp: '近親相姦・姉妹母', zh: '近亲・姐妹母女', en: 'Incest Fantasy', emoji: '🩸', category: 'Fetish', rating: 'nsfw' },
  { id: 'yuri', name: '百合', jp: '百合・女性同士', zh: '百合・女女', en: 'Yuri / Lesbian', emoji: '🌸', category: 'Fetish', rating: 'nsfw' },
  { id: 'master-servant', name: '主従', jp: '主従・ご主人様', zh: '主仆・主人与奴仆', en: 'Master & Servant', emoji: '🧎‍♀️', category: 'Fetish', rating: 'nsfw' },
  { id: 'training', name: '調教', jp: '調教・飼育', zh: '调教・宠物服从', en: 'Pet Training / BDSM', emoji: '🐕', category: 'Fetish', rating: 'nsfw' },
  { id: 'bondage', name: '拘束', jp: '拘束・緊縛', zh: '束缚・捆绑拘束', en: 'Bondage & Restraints', emoji: '🪢', category: 'Fetish', rating: 'nsfw' },
  { id: 'confinement', name: '監禁', jp: '監禁・軟禁', zh: '监禁・囚禁密室', en: 'Confinement / Cage', emoji: '🗝️', category: 'Fetish', rating: 'nsfw' },
  { id: 'tentacles', name: '触手', jp: '触手・異種姦', zh: '触手・异种交配', en: 'Tentacles & Monsters', emoji: '🐙', category: 'Fetish', rating: 'nsfw' },
  { id: 'sleep-sex', name: '睡眠姦', jp: '睡眠姦・眠姦', zh: '睡奸・梦中逆袭', en: 'Sleep Sex / Somnophilia', emoji: '🛌', category: 'Fetish', rating: 'nsfw' },
  { id: 'reverse-rape', name: '逆レイプ', jp: '逆レイプ・逆レ', zh: '逆推・强行索取', en: 'Reverse Rape / Aggressive', emoji: '⚠️', category: 'Fetish', rating: 'nsfw' },
  { id: 'virgin-female', name: '処女喪失', jp: '処女喪失・初体験', zh: '破处・初次交合', en: 'Defloration / First Time', emoji: '🩸', category: 'Fetish', rating: 'nsfw' },
  { id: 'virgin-male', name: '童貞卒業', jp: '童貞卒業・初夜', zh: '童贞毕业・初夜受教', en: 'Virgin Boy Graduation', emoji: '🎓', category: 'Fetish', rating: 'nsfw' },
  { id: 'omorashi', name: 'おもらし', jp: 'おもらし・放尿', zh: '漏尿・失禁潮吹', en: 'Omorashi / Incontinence', emoji: '🚾', category: 'Fetish', rating: 'nsfw' },
  { id: 'soapland', name: '風俗', jp: '風俗・ソープ', zh: '风俗店・泡泡浴', en: 'Soapland / Brothel RP', emoji: '🧼', category: 'Fetish', rating: 'nsfw' },
  { id: 'hypnotic-voice', name: '催眠音声', jp: '催眠音声・洗脳', zh: '催眠音频・精神控制', en: 'Hypnotic Voice / Trance', emoji: '🌀', category: 'Fetish', rating: 'nsfw' },
];

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { id: 'all', label: 'All Languages', flag: '🌐', short: 'All' },
  { id: 'ja', label: 'Japanese (日本語)', flag: '🇯🇵', short: 'JPN' },
  { id: 'zh-hans', label: 'Simplified Chinese (简体中文)', flag: '🇨🇳', short: '简中' },
  { id: 'zh-hant', label: 'Traditional Chinese (繁體中文)', flag: '🇹🇼', short: '繁中' },
  { id: 'en', label: 'English (ENG)', flag: '🇬🇧', short: 'ENG' },
  { id: 'ko', label: 'Korean (한국어)', flag: '🇰🇷', short: 'KO' },
];

export async function searchWorks(
  query: string = '',
  page: number = 1,
  order: string = 'release',
  sort: string = 'desc',
  subtitle?: boolean,
  lang: string = 'all',
  tag: string = '',
  nsfw: string = 'all'
): Promise<SearchResponse> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  params.set('page', page.toString());
  params.set('order', order);
  params.set('sort', sort);
  if (subtitle !== undefined) {
    params.set('subtitle', subtitle ? '1' : '0');
  }
  if (lang && lang !== 'all') {
    params.set('lang', lang);
  }
  if (tag) {
    params.set('tag', tag);
  }
  if (nsfw && nsfw !== 'all') {
    params.set('nsfw', nsfw);
  }

  const res = await fetch(`/api/search?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Search failed with status ${res.status}`);
  }
  return res.json();
}

export interface WorkLanguageInfo {
  primary: {
    code: string;
    label: string;
    flag: string;
    badgeClass: string;
  };
  hasMultipleEditions: boolean;
  editions: Array<{
    lang: string;
    label: string;
    workno: string;
  }>;
}

export function getWorkLanguageInfo(work: WorkItem): WorkLanguageInfo {
  const attrs = (work.work_attributes || '').toUpperCase();
  const transLang = (work.translation_info?.lang || '').toUpperCase();
  const editions: any[] = Array.isArray(work.language_editions)
    ? work.language_editions
    : typeof work.language_editions === 'object' && work.language_editions
    ? Object.values(work.language_editions)
    : [];

  let primary = {
    code: 'ja',
    label: '日本語',
    flag: '🇯🇵',
    badgeClass: 'bg-red-500/20 text-red-300 border-red-500/30',
  };

  if (attrs.includes('CHI_HANS') || transLang.includes('CHI_HANS') || /【简体中文版】|【汉化】/i.test(work.title)) {
    primary = {
      code: 'zh-hans',
      label: '简中',
      flag: '🇨🇳',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    };
  } else if (attrs.includes('CHI_HANT') || transLang.includes('CHI_HANT') || /【繁體中文版】/i.test(work.title)) {
    primary = {
      code: 'zh-hant',
      label: '繁中',
      flag: '🇹🇼',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    };
  } else if (attrs.includes('ENG') || transLang.includes('ENG') || /【English】/i.test(work.title)) {
    primary = {
      code: 'en',
      label: 'ENG',
      flag: '🇬🇧',
      badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    };
  } else if (attrs.includes('KO_KR') || transLang.includes('KO_KR')) {
    primary = {
      code: 'ko',
      label: '한국어',
      flag: '🇰🇷',
      badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    };
  }

  return {
    primary,
    hasMultipleEditions: editions.length > 0,
    editions,
  };
}

export async function getWorkDetails(idOrRj: string | number): Promise<WorkItem> {
  const res = await fetch(`/api/work/${encodeURIComponent(idOrRj)}`);
  if (!res.ok) {
    throw new Error(`Failed to load work details (${res.status})`);
  }
  return res.json();
}

export async function getWorkTracks(idOrRj: string | number): Promise<TrackItem[]> {
  const res = await fetch(`/api/tracks/${encodeURIComponent(idOrRj)}`);
  if (!res.ok) {
    throw new Error(`Failed to load tracks (${res.status})`);
  }
  return res.json();
}

export function flattenTrackTree(
  items: TrackItem[],
  workId: number,
  workTitle?: string,
  parentPath: string = ''
): FlatTrack[] {
  let flat: FlatTrack[] = [];
  for (const item of items) {
    const currentPath = parentPath ? `${parentPath}/${item.title}` : item.title;
    if (item.type === 'folder' && item.children) {
      flat = flat.concat(flattenTrackTree(item.children, workId, workTitle, currentPath));
    } else {
      flat.push({
        id: item.hash || `${workId}_${currentPath}`,
        title: item.title,
        type: item.type,
        size: item.size,
        duration: item.duration,
        streamUrl: item.mediaStreamUrl || '',
        downloadUrl: item.mediaDownloadUrl || item.mediaStreamUrl || '',
        path: currentPath,
        workId,
        workTitle,
      });
    }
  }
  return flat;
}

export function getDownloadProxyUrl(targetUrl: string, filename: string): string {
  return `/api/download/file?url=${encodeURIComponent(targetUrl)}&name=${encodeURIComponent(filename)}`;
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export interface TranslateTextParams {
  text: string;
  targetLang: string;
  sourceLang?: string;
  mode?: 'translated' | 'bilingual' | 'annotations';
  tone?: 'asmr' | 'natural' | 'literal';
}

export interface TranslateTextResponse {
  translatedText: string;
  targetLang: string;
  sourceLang: string;
  mode: 'translated' | 'bilingual' | 'annotations';
  charCount: number;
  engine: string;
}

export const SCRIPT_TRANSLATE_LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧', short: 'ENG' },
  { code: 'zh-hans', label: '简体中文 (Simplified Chinese)', flag: '🇨🇳', short: '简中' },
  { code: 'zh-hant', label: '繁體中文 (Traditional Chinese)', flag: '🇹🇼', short: '繁中' },
  { code: 'ko', label: '한국어 (Korean)', flag: '🇰🇷', short: '한국어' },
  { code: 'ja', label: '日本語 (Japanese)', flag: '🇯🇵', short: '日本語' },
  { code: 'vi', label: 'Tiếng Việt (Vietnamese)', flag: '🇻🇳', short: 'Việt' },
  { code: 'es', label: 'Español (Spanish)', flag: '🇪🇸', short: 'ESP' },
  { code: 'fr', label: 'Français (French)', flag: '🇫🇷', short: 'FRA' },
  { code: 'de', label: 'Deutsch (German)', flag: '🇩🇪', short: 'DEU' },
  { code: 'ru', label: 'Русский (Russian)', flag: '🇷🇺', short: 'RUS' },
  { code: 'id', label: 'Bahasa Indonesia', flag: '🇮🇩', short: 'IDN' },
  { code: 'th', label: 'ไทย (Thai)', flag: '🇹🇭', short: 'THA' },
];

export async function translateScriptText(params: TranslateTextParams): Promise<TranslateTextResponse> {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Translation request failed (${res.status})`);
  }
  return res.json();
}

