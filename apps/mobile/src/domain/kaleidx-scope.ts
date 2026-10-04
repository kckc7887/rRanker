export const KALEIDX_GATE_IDS = ['blue', 'white', 'purple', 'black', 'yellow', 'red'] as const;
export type KaleidxGateId = typeof KALEIDX_GATE_IDS[number];
export type KaleidxDifficulty = 'BASIC' | 'EXPERT' | 'MASTER' | 'Re:MASTER';
export type KaleidxTrackerKind = 'all' | 'run' | 'random-one';

export type KaleidxSong = {
  id: string;
  title: string;
  chartType?: 'SD' | 'DX';
};

export type KaleidxSchedulePhase = {
  startsAt: string;
  endsAt: string | null;
  difficulty: KaleidxDifficulty;
  life: number;
  dxLife?: number | null;
};

export type KaleidxReference = {
  label: string;
  url: string;
  checkedAt: string;
};

export type KaleidxSchedule = {
  label: string;
  switchLabel: string;
  phases: readonly KaleidxSchedulePhase[];
  evidence?: { status: 'estimated'; source: KaleidxReference };
};

export type KaleidxGate = {
  id: KaleidxGateId;
  order: number;
  label: string;
  shortLabel: string;
  color: string;
  onColor: string;
  darkColor?: string;
  darkOnColor?: string;
  area: string;
  openedAt: string;
  trackerKind: KaleidxTrackerKind;
  requirements: readonly string[];
  trackerNote: string;
  keySongs: readonly KaleidxSong[];
  track1: readonly KaleidxSong[];
  track2: readonly KaleidxSong[];
  track3: KaleidxSong;
  perfectChallenge?: KaleidxSong;
  gateSchedule: KaleidxSchedule;
  perfectSchedule?: KaleidxSchedule;
};

const songs = (entries: readonly (readonly [string, string])[]): readonly KaleidxSong[] => (
  entries.map(([id, title]) => ({ id, title }))
);

const phases = (
  resetHour: '00' | '04',
  entries: readonly (readonly [string, string | null, KaleidxDifficulty, number])[],
): readonly KaleidxSchedulePhase[] => entries.map(([start, end, difficulty, life]) => ({
  startsAt: `2026-${start}T${resetHour}:00:00+08:00`,
  endsAt: end ? `2026-${end}T${resetHour}:00:00+08:00` : null,
  difficulty,
  life,
}));

const blueKey = songs([
  ['11009', 'STEREOSCAPE'], ['11008', 'Crazy Circle'], ['11100', 'シエルブルーマルシェ'],
  ['11097', 'ブレインジャックシンドローム'], ['11098', '共鳴'], ['11099', 'Ututu'],
  ['11163', 'REAL VOICE'], ['11162', 'ユメヒバナ'], ['11161', 'オリフィス'],
  ['11228', '星めぐり、果ての君へ。'], ['11229', 'スローアライズ'], ['11231', '生命不詳'],
  ['11739', '184億回のマルチトニック'], ['11463', 'RIFFRAIN'], ['11464', 'Falling'],
  ['11465', 'ピリオドサイン'], ['11538', 'アンバークロニクル'], ['11539', 'リフヴェイン'],
  ['11541', '宵の鳥'], ['11620', 'フェイクフェイス・フェイルセイフ'], ['11622', 'シックスプラン'],
  ['11623', 'フタタビ'], ['11737', 'パラドクスイヴ'], ['11738', 'YKWTD'],
  ['11164', 'パラボラ'], ['11230', 'チエルカ／エソテリカ'], ['11466', '群青シグナル'],
  ['11540', 'Kairos'], ['11621', 'ふらふらふら、'],
]);

const whiteKey = songs([
  ['11102', '封焔の135秒'], ['11234', 'ほしぞらスペクタクル'], ['11300', 'U&iVERSE -銀河鸞翔-'],
  ['11529', 'ツムギボシ'], ['11542', 'ここからはじまるプロローグ。 (Kanon Remix)'], ['11612', 'Latent Kingdom'],
]);

const purpleKey = songs([
  ['328', '言ノ葉カルマ'], ['403', '悪戯'], ['457', '言ノ葉遊戯'], ['458', 'りばーぶ'],
  ['532', '洗脳'], ['533', 'Barbed Eye'], ['559', '空威張りビヘイビア'], ['568', '分からない'],
  ['613', '天国と地獄 -言ノ葉リンネ-'], ['626', '相思創愛'], ['673', '咲キ誇レ常世ノ華'],
  ['11001', 'BLACK ROSE'], ['11002', 'Secret Sleuth'], ['11104', 'ヤミツキ'],
  ['11105', 'ワードワードワード'], ['11168', 'シアトリカル・ケース'],
  ['11169', 'ステップアンドライム'], ['11170', '届かない花束'], ['11365', 'アンビバレンス'],
  ['11380', 'パーフェクション'], ['11381', 'デーモンベット'], ['11456', '分解収束テイル'],
  ['11532', 'ヱデン'], ['11533', 'にゃーにゃー冒険譚'], ['11613', 'Mystic Parade'],
  ['11614', 'Cry Cry Cry'], ['11747', '地獄'], ['11748', 'シスターシスター'],
]);

const blackKey = songs([
  ['11023', 'Blows Up Everything'], ['11106', 'Valsqotch'], ['11221', '≠彡\"/了→'],
  ['11222', 'BREaK! BREaK! BREaK!'], ['11300', 'U&iVERSE -銀河鸞翔-'], ['11374', 'GIGANTØMAKHIA'],
  ['11458', 'Rising on the horizon'], ['11523', 'ViRTUS'], ['11619', 'KHYMΞXΛ'],
  ['11663', '系ぎて'], ['11746', 'Divide et impera!'],
]);

const yellowKey = songs([
  ['11003', 'でらっくmaimai♪てんてこまい!'], ['11095', '絡めトリック利己ライザー'],
  ['11152', 'ぼくたちいつでも しゅわっしゅわ！'], ['11224', 'Paradisoda'],
  ['11296', 'とびだせ！TO THE COSMIC!!'], ['11375', 'ミルキースター・シューティングスター'],
  ['11452', 'ホシシズク'], ['11529', 'ツムギボシ'], ['11608', 'NOIZY BOUNCE'],
  ['11669', 'エスオーエス'], ['11736', 'プリズム△▽リズム'], ['11806', 'Fraq'],
]);

const redKey = songs([
  ['212', '神室雪月花'], ['213', 'KONNANじゃないっ！'], ['337', '鼓動'],
  ['270', "Outlaw's Lullaby"], ['271', 'Brand-new Japanesque'],
  ['11504', 'ばかみたい【Taxi Driver Edition】'], ['339', 'DRAGONLADY'],
  ['453', 'Garden Of The Dragon'], ['11336', 'ドラゴンエネルギー'], ['11852', '好きな惣菜発表ドラゴン'],
]);

export const KALEIDX_GATES: readonly KaleidxGate[] = [
  {
    id: 'blue', order: 1, label: '蓝色之门', shortLabel: '蓝', color: '#2878D0', onColor: '#FFFFFF',
    area: '青春区域', openedAt: '2026-01-23T10:00:00+08:00', trackerKind: 'all',
    requirements: ['完成青春区域收录的全部 29 首钥匙曲目', '须在国服门更新后至少游玩一次；难度不限', '宴谱与段位模式不计入'],
    trackerNote: '29 首全部勾选后，仅代表手动记录已满足钥匙曲条件。', keySongs: blueKey,
    track1: songs([
      ['11008', 'Crazy Circle'], ['11009', 'STEREOSCAPE'], ['11100', 'シエルブルーマルシェ'],
      ['11097', 'ブレインジャックシンドローム'], ['11098', '共鳴'], ['11099', 'Ututu'],
      ['11161', 'オリフィス'], ['11162', 'ユメヒバナ'], ['11163', 'REAL VOICE'],
      ['11228', '星めぐり、果ての君へ。'], ['11229', 'スローアライズ'], ['11231', '生命不詳'],
      ['11463', 'RIFFRAIN'], ['11464', 'Falling'], ['11465', 'ピリオドサイン'],
      ['11538', 'アンバークロニクル'], ['11539', 'リフヴェイン'], ['11541', '宵の鳥'],
      ['11620', 'フェイクフェイス・フェイルセイフ'], ['11622', 'シックスプラン'],
      ['11623', 'フタタビ'], ['11737', 'パラドクスイヴ'], ['11738', 'YKWTD'],
    ]),
    track2: songs([
      ['11164', 'パラボラ'], ['11230', 'チエルカ／エソテリカ'], ['11466', '群青シグナル'],
      ['11540', 'Kairos'], ['11621', 'ふらふらふら、'], ['11739', '184億回のマルチトニック'],
    ]),
    track3: { id: '11740', title: '果ての空、僕らが見た光。' },
    perfectChallenge: { id: '11739', title: '184億回のマルチトニック' },
    gateSchedule: { label: '蓝门', switchLabel: '北京时间 04:00 切换', phases: phases('04', [
      ['02-01', '02-05', 'MASTER', 50], ['02-05', '02-12', 'EXPERT', 100], ['02-12', null, 'BASIC', 999],
    ]) },
    perfectSchedule: { label: '完美挑战', switchLabel: '北京时间 04:00 切换', phases: phases('04', [
      ['01-30', '02-06', 'MASTER', 10], ['02-06', '02-13', 'EXPERT', 50],
      ['02-13', '02-20', 'BASIC', 100], ['02-20', null, 'BASIC', 300],
    ]) },
  },
  {
    id: 'white', order: 2, label: '白色之门', shortLabel: '白', color: '#E8EDF4', onColor: '#1F2937',
    area: '天界区域 8', openedAt: '2026-02-10T07:00:00+08:00', trackerKind: 'run',
    requirements: ['先将背景设置为「Latent Kingdom」', '一局通常模式内只游玩作曲家含「奏音」或「大国奏音」的不重复曲目', '单人连续 3 首或多人连续 4 首，难度不限', '通常模式 SKIP 计入；宴谱与段位模式不计入'],
    trackerNote: '单人与多人计划分别保存；切换人数不会覆盖另一套计划。', keySongs: whiteKey,
    track1: songs([
      ['11027', 'アポカリプスに反逆の焔を焚べろ'], ['11101', 'GRÄNDIR'], ['11103', '渦状銀河のシンフォニエッタ'],
      ['11166', 'ワンダーシャッフェンの法則'], ['11167', 'BIRTH'], ['11236', 'Last Samurai'],
      ['11237', '蒼穹舞楽'], ['11301', '華の集落、秋のお届け'], ['11303', '星詠みとデスペラード'],
      ['11387', '星空パーティーチューン'], ['11388', 'チューリングの跡'], ['11386', 'Swift Swing'],
      ['11467', 'Beat Opera op.1'], ['11468', '星見草'], ['11469', '"411Ψ892"'],
      ['11682', 'Geranium'], ['11683', 'The Cursed Doll'], ['11684', 'RondeauX of RagnaroQ'],
      ['11742', 'Ourania'], ['11743', '天蓋'],
    ]),
    track2: songs([
      ['11026', 'TEmPTaTiON'], ['11102', '封焔の135秒'], ['11165', 'Regulus'], ['11238', 'AMABIE'],
      ['11302', 'BLACK SWAN'], ['11389', 'Sage'], ['11470', '康莊大道'], ['11685', 'ℝ∈Χ LUNATiCA'], ['11744', 'Deicide'],
    ]),
    track3: { id: '11745', title: '氷滅の135小節' }, perfectChallenge: { id: '11744', title: 'Deicide' },
    gateSchedule: { label: '白门', switchLabel: '北京时间 04:00 切换', phases: phases('04', [
      ['02-10', '02-13', 'MASTER', 1], ['02-13', '02-16', 'MASTER', 10], ['02-16', '02-19', 'MASTER', 30],
      ['02-19', '02-23', 'MASTER', 50], ['02-23', '03-02', 'EXPERT', 100], ['03-02', null, 'BASIC', 999],
    ]) },
    perfectSchedule: { label: '完美挑战', switchLabel: '北京时间 04:00 切换', phases: phases('04', [
      ['02-10', '02-17', 'MASTER', 1], ['02-17', '02-24', 'MASTER', 10], ['02-24', '03-03', 'EXPERT', 50],
      ['03-03', '03-10', 'EXPERT', 100], ['03-10', null, 'BASIC', 300],
    ]) },
  },
  {
    id: 'purple', order: 3, label: '紫色之门', shortLabel: '紫', color: '#8A55C6', onColor: '#FFFFFF',
    area: 'BLACK ROSE 区域 10', openedAt: '2026-03-25T10:00:00+08:00', trackerKind: 'run',
    requirements: ['将旅行伙伴队长设置为 BLACK ROSE 区域的「アウル」或任意变种', '单人连续游玩 3 首或双人连续游玩 4 首不重复的言ノ葉Project 曲目', '难度不限；宴谱与段位模式不计入'],
    trackerNote: '单人与多人计划分别保存；请在同一局内按计划完成。', keySongs: purpleKey,
    track1: purpleKey.slice(0, 11), track2: purpleKey.slice(11),
    track3: { id: '11749', title: '有明/Ariake' },
    gateSchedule: { label: '紫门', switchLabel: '北京时间 04:00 切换', phases: phases('04', [
      ['03-25', '03-28', 'MASTER', 1], ['03-28', '03-31', 'MASTER', 10], ['03-31', '04-03', 'MASTER', 30],
      ['04-03', '04-07', 'MASTER', 50], ['04-07', '04-15', 'EXPERT', 100], ['04-15', null, 'BASIC', 999],
    ]) },
  },
  {
    id: 'black', order: 4, label: '黑色之门', shortLabel: '黑', color: '#475569', onColor: '#FFFFFF',
    darkColor: '#CBD5E1', darkOnColor: '#182130',
    area: '大都会区域 9', openedAt: '2026-04-28T10:00:00+08:00', trackerKind: 'all',
    requirements: ['先完成大都会区域 9，使黑色之门出现', '在门更新后至少游玩一次全部 11 首 KOP6 及以前的钥匙曲目', '难度不限；宴谱不计入'],
    trackerNote: '11 首全部勾选后，仅代表手动记录已满足钥匙曲条件。', keySongs: blackKey,
    track1: songs([
      ['11019', 'Scarlet Wings'], ['11020', 'Technicians High'], ['11021', '魔ジョ狩リ'], ['11022', 'TwisteD! XD'],
      ['11090', 'Flashkick'], ['11091', 'Stardust Memories'], ['11092', 'My My My'], ['11157', 'Aetheric Energy'],
      ['11158', 'Komplexe'], ['11159', 'Beautiful Future'], ['11232', 'Never Give Up!'], ['11233', 'Starry Colors'],
      ['11234', 'ほしぞらスペクタクル'], ['11304', 'Round Round Spinning Around'], ['11305', 'Alcyone'],
      ['11306', 'Raven Emperor'], ['11382', 'HECATONCHEIR'], ['11383', 'Irresistible'], ['11384', 'HAGAKIRI'],
      ['11459', 'You Mean the World to Me'], ['11460', 'Neon Kingdom'], ['11461', '#狂った民族２ PRAVARGYAZOOQA'],
      ['11615', 'ぽわわん劇場'], ['11616', 'my flow'], ['11617', 'POWER OF UNITY'], ['11674', 'Cider P@rty'],
      ['11675', '勦滅'], ['11676', 'Lunatic Vibes'], ['11750', 'Flashback'], ['11751', 'Colorfull:Encounter'],
    ]),
    track2: songs([
      ['11023', 'Blows Up Everything'], ['11089', 'STEEL TRANSONIC'], ['11160', 'Mutation'],
      ['11235', 'VIIIbit Explorer'], ['11307', 'Yorugao'], ['11385', 'N3V3R G3T OV3R'],
      ['11462', 'VSpook!'], ['11618', 'Energizing Flame'], ['11677', 'Bloody Trail'], ['11752', '雨露霜雪'],
    ]),
    track3: { id: '11753', title: '宙天' }, perfectChallenge: { id: '11752', title: '雨露霜雪' },
    gateSchedule: { label: '黑门', switchLabel: '北京时间 04:00 切换', phases: phases('04', [
      ['04-28', '05-01', 'MASTER', 1], ['05-01', '05-04', 'MASTER', 10], ['05-04', '05-07', 'MASTER', 30],
      ['05-07', '05-11', 'MASTER', 50], ['05-11', '05-18', 'EXPERT', 100], ['05-18', null, 'BASIC', 999],
    ]) },
    perfectSchedule: { label: '完美挑战', switchLabel: '北京时间 00:00 切换', phases: phases('00', [
      ['04-28', '05-05', 'MASTER', 1], ['05-05', '05-12', 'MASTER', 10], ['05-12', '05-19', 'EXPERT', 50],
      ['05-19', '05-26', 'BASIC', 100], ['05-26', null, 'BASIC', 300],
    ]) },
  },
  {
    id: 'yellow', order: 5, label: '黄色之门', shortLabel: '黄', color: '#E5B824', onColor: '#332B11',
    area: '七彩区域', openedAt: '2026-06-10T10:00:00+08:00', trackerKind: 'random-one',
    requirements: ['使用游戏内「随机选曲」选中钥匙曲池中的任意一首', '可先将钥匙曲加入收藏夹，再使用「随机收藏夹」', '只需随机命中并游玩一首；难度不限', '宴谱与段位模式不计入'],
    trackerNote: '这里仅记录机台随机命中的歌曲，不代替游戏内「随机选曲」。', keySongs: yellowKey,
    track1: songs([
      ['11003', 'でらっくmaimai♪てんてこまい!'], ['11007', '超常マイマイン'], ['11006', 'P-qoq'],
      ['11005', 'バーチャルダム　ネーション'], ['11094', 'ここからはじまるプロローグ。'],
      ['11095', '絡めトリック利己ライザー'], ['11096', 'モ°ルモ°ル'], ['11152', 'ぼくたちいつでも　しゅわっしゅわ！'],
      ['11153', "Boys O'Clock"], ['11154', '居並ぶ穀物と溜息まじりの運送屋'], ['11224', 'Paradisoda'],
      ['11225', 'VANTABLACK RAVER'], ['11226', '時計の国のジェミニ'], ['11296', 'とびだせ！TO THE COSMIC!!'],
      ['11297', '噛み係'], ['11298', 'トリアージ'], ['11375', 'ミルキースター・シューティングスター'],
      ['11376', 'ｉｓｏｐｈｏｔｅ'], ['11377', 'パラマウント☆ショータイム！！'], ['11452', 'ホシシズク'],
      ['11453', 'Rainbow Rush Story'], ['11454', 'Tricolor⁂circuS'], ['11526', 'トノサマビーム'],
      ['11527', 'enchanted wanderer'], ['11528', 'Comet Panto Men!'], ['11608', 'NOIZY BOUNCE'],
      ['11609', 'サンバディ！'], ['11610', 'Horoscope Express'], ['11669', 'エスオーエス'],
      ['11670', 'のじゃロリック'], ['11671', 'Edelweiss'], ['11806', 'Fraq'], ['11807', 'ウタヒメナイトストーム'],
    ]),
    track2: songs([
      ['11004', 'MAXRAGE'], ['11093', 'UniTas'], ['11155', 'ARAIS'], ['11227', 'Xenovcipher'],
      ['11299', 'NAGAREBOSHI☆ROCKET'], ['11378', 'Strive against fate'], ['11455', '[X]'],
      ['11529', 'ツムギボシ'], ['11611', 'Party☆People☆Princess'], ['11672', 'QuiQ'], ['11808', 'Feel The Luv'],
    ]),
    track3: { id: '11809', title: 'Åntinomiε' }, perfectChallenge: { id: '11808', title: 'Feel The Luv' },
    gateSchedule: { label: '黄门', switchLabel: '北京时间 04:00 切换', phases: phases('04', [
      ['06-10', '06-13', 'MASTER', 1], ['06-13', '06-17', 'MASTER', 10], ['06-17', '06-19', 'MASTER', 30],
      ['06-19', '06-23', 'MASTER', 50], ['06-23', '06-30', 'EXPERT', 100], ['06-30', null, 'BASIC', 999],
    ]) },
    perfectSchedule: { label: '完美挑战', switchLabel: '北京时间 04:00 切换', phases: phases('04', [
      ['06-10', '06-11', 'MASTER', 1], ['06-11', '06-13', 'MASTER', 10], ['06-13', '06-17', 'EXPERT', 50],
      ['06-17', '06-24', 'BASIC', 100], ['06-24', null, 'BASIC', 300],
    ]) },
  },
  {
    id: 'red', order: 6, label: '红色之门', shortLabel: '红', color: '#D94A4A', onColor: '#FFFFFF',
    area: '龙之区域 4', openedAt: '2026-08-05T10:00:00+08:00', trackerKind: 'all',
    requirements: ['完成龙之区域 4，使红色之门出现', '在门更新后至少游玩一次全部 10 首钥匙曲目', '难度不限，可以 SKIP；宴谱与段位模式不计入'],
    trackerNote: '10 首全部勾选后，仅代表手动记录已满足钥匙曲条件。', keySongs: redKey,
    track1: songs([
      ['11016', 'キリキリ舞Mine'], ['11017', '福宿音屋魂音泉'], ['11018', 'Now or Never'], ['11015', '一か罰'],
      ['11545', '隠密あんみつDX'], ['11546', '地球'], ['11547', 'Churros Parlor'],
      ['11548', '超熊猫的周遊記（ワンダーパンダートラベラー）'], ['11678', 'RE:INCARNATED DRAGNER'],
      ['11679', 'Beginning together!'], ['11680', 'Shining Ray ～僕らの絆～'], ['11681', 'DEVOTION'],
      ['11811', '概して過誤'], ['11812', 'Unfinished Epic'],
    ]),
    track2: songs([
      ['11015', '一か罰'], ['11548', '超熊猫的周遊記（ワンダーパンダートラベラー）'],
      ['11681', 'DEVOTION'], ['11813', '忙シー日'],
    ]),
    track3: { id: '11814', title: 'FLΛME/FRΦST' }, perfectChallenge: { id: '11813', title: '忙シー日' },
    gateSchedule: { label: '红门', switchLabel: '北京时间 04:00 切换', phases: phases('04', [
      ['08-05', '08-08', 'MASTER', 1], ['08-08', '08-11', 'MASTER', 10], ['08-11', '08-14', 'MASTER', 30],
      ['08-14', '08-18', 'MASTER', 50], ['08-18', '08-25', 'EXPERT', 100], ['08-25', null, 'BASIC', 999],
    ]) },
    perfectSchedule: { label: '完美挑战', switchLabel: '北京时间 00:00 切换', phases: phases('00', [
      ['08-05', '08-06', 'MASTER', 1], ['08-06', '08-08', 'MASTER', 10], ['08-08', '08-12', 'EXPERT', 50],
      ['08-12', '08-19', 'BASIC', 100], ['08-19', null, 'BASIC', 300],
    ]) },
  },
] as const;

export const KALEIDX_GATES_BY_ID = Object.fromEntries(
  KALEIDX_GATES.map((gate) => [gate.id, gate]),
) as Record<KaleidxGateId, KaleidxGate>;

export const KALEIDX_FINALE_IDS = ['prism', 'error', 'hope', 'final'] as const;
export type KaleidxFinaleId = typeof KALEIDX_FINALE_IDS[number];
export const KALEIDX_STAGE_IDS = [...KALEIDX_GATE_IDS, ...KALEIDX_FINALE_IDS] as const;
export type KaleidxStageId = typeof KALEIDX_STAGE_IDS[number];

export type KaleidxChallenge =
  | { kind: 'random-three'; track1: readonly KaleidxSong[]; track2: readonly KaleidxSong[]; track3: KaleidxSong }
  | { kind: 'error'; track1: readonly KaleidxSong[]; track2: readonly KaleidxSong[]; story: string }
  | { kind: 'fixed-three'; tracks: readonly [KaleidxSong, KaleidxSong, KaleidxSong] }
  | { kind: 'final-single'; song: KaleidxSong; endingSong: KaleidxSong; partner: string; mechanics: readonly string[] };

export type KaleidxFinale = Omit<KaleidxGate,
  'id' | 'trackerKind' | 'keySongs' | 'track1' | 'track2' | 'track3' | 'gateSchedule'
> & {
  id: KaleidxFinaleId;
  trackerKind: 'completion';
  prerequisites: readonly KaleidxStageId[];
  completionLabel: string;
  challenge: KaleidxChallenge;
  gateSchedule?: KaleidxSchedule;
  references: readonly KaleidxReference[];
};
export type KaleidxStage = KaleidxGate | KaleidxFinale;

const awmcReference = (section: string): KaleidxReference => ({
  label: 'AWMC 活动资料',
  url: `https://github.com/AWMC-TEAM/KALEIDXSCOPE/blob/master/${section}KALEIDXSCOPE/index.html`,
  checkedAt: '2026-10-03',
});
const finaleGuide: KaleidxReference = {
  label: '国服棱镜塔与 ERROR 攻略',
  url: 'https://bearstaryellowbear.cn/archives/kaleidxscopeleng-jing-ta-he-errormen-jie-suo-gong-lue',
  checkedAt: '2026-10-03',
};
const estimatedSchedule = (label: string, section: string): KaleidxSchedule => ({
  label,
  switchLabel: '推算按北京时间 04:00 切换',
  evidence: { status: 'estimated', source: awmcReference(section) },
  phases: phases('04', [
    ['10-01', '10-04', 'MASTER', 1], ['10-04', '10-07', 'MASTER', 10],
    ['10-07', '10-10', 'MASTER', 30], ['10-10', '10-14', 'MASTER', 50],
    ['10-14', '10-21', 'EXPERT', 100], ['10-21', null, 'BASIC', 999],
  ]),
});
const dxSongs = (entries: readonly (readonly [string, string])[]): readonly KaleidxSong[] => (
  songs(entries).map((song) => ({ ...song, chartType: 'DX' }))
);
const amereistr: KaleidxSong = { id: '11817', title: 'Amereistr', chartType: 'DX' };
const blackbox: KaleidxSong = { id: '11818', title: "World's end BLACKBOX", chartType: 'DX' };

export const KALEIDX_FINALES: readonly KaleidxFinale[] = [
  {
    id: 'prism', order: 7, label: '棱镜塔', shortLabel: '棱镜塔', color: '#367E9A', onColor: '#FFFFFF',
    area: '7sRef 区域 4 · 2000 km', openedAt: '2026-10-01T10:00:00+08:00', trackerKind: 'completion',
    prerequisites: KALEIDX_GATE_IDS, completionLabel: '棱镜塔已通关',
    requirements: ['通关蓝、白、紫、黑、黄、红六扇门，取得万能钥匙', '完成 7sRef 区域 4（2000 km），使棱镜塔出现', '完成塔内三首课题后进入 ERROR 阶段'],
    trackerNote: '手动记录本账号的通关情况；区域跑图进度请在机台确认。',
    perfectChallenge: amereistr,
    challenge: {
      kind: 'random-three',
      track1: dxSongs([
        ['11310', 'Trick tear'], ['11309', '前衛的Landscape'], ['11395', 'Jouez Avec Moi?'],
        ['11393', '白花の天使'], ['11392', 'Metamorphosism'], ['11534', 'The Great Banquet'],
        ['11535', 'Redemption'], ['11536', 'Ether Second'], ['11815', 'IMBRUED:FLUX'], ['11816', '砂の函'],
      ]),
      track2: [...dxSongs([
        ['11311', '躯樹の墓守'], ['11394', "World's end loneliness"], ['11537', 'Straight into the lights'],
      ]), amereistr],
      track3: blackbox,
    },
    gateSchedule: estimatedSchedule('棱镜塔', 'PRISM'),
    references: [awmcReference('PRISM'), finaleGuide],
  },
  {
    id: 'error', order: 8, label: 'ERROR 阶段', shortLabel: 'ERROR', color: '#67557D', onColor: '#FFFFFF',
    area: 'KALEIDXSCOPE · 乱码课题', openedAt: '2026-10-01T10:00:00+08:00', trackerKind: 'completion',
    prerequisites: ['prism'], completionLabel: 'ERROR 阶段已完成',
    requirements: ['通关棱镜塔后出现，无需另取钥匙', '完成前两首随机课题，再挑战第三首乱码课题', '推进至剧情蓝屏与重建演出后，继续前往希望之门'],
    trackerNote: '到达剧情结束后手动标记；剧情蓝屏属于活动演出。',
    challenge: {
      kind: 'error',
      track1: [...KALEIDX_GATES.flatMap((gate) => gate.perfectChallenge ? [{ ...gate.perfectChallenge, chartType: 'DX' as const }] : []), amereistr],
      track2: [...KALEIDX_GATES.map((gate) => ({ ...gate.track3, chartType: 'DX' as const })), blackbox],
      story: '第三首显示为乱码课题。计时结束后会出现异常谱面、冻结与剧情蓝屏，随后提示寻找最后的希望。此课题不作为普通曲库歌曲展示。',
    },
    references: [awmcReference('ERROR'), finaleGuide],
  },
  {
    id: 'hope', order: 9, label: '希望之门', shortLabel: '希望', color: '#98751F', onColor: '#FFFFFF',
    area: '希望の扉', openedAt: '2026-10-01T10:00:00+08:00', trackerKind: 'completion',
    prerequisites: ['error'], completionLabel: '希望之门已通关',
    requirements: ['完成 ERROR 阶段后，希望之门出现', '国服无需实体 DX PASS，按机台提示进入', '连续完成三首固定课题，开启最终挑战'],
    trackerNote: '手动记录本账号的通关情况。',
    challenge: {
      kind: 'fixed-three',
      tracks: [
        { id: '1736', title: 'プリズム△▽リズム', chartType: 'SD' },
        { id: '10835', title: 'Believe the Rainbow', chartType: 'DX' },
        { id: '1819', title: 'AFTER PANDORA', chartType: 'SD' },
      ],
    },
    gateSchedule: estimatedSchedule('希望之门', 'HOP'),
    references: [awmcReference('HOP')],
  },
  {
    id: 'final', order: 10, label: '最终挑战', shortLabel: '最终', color: '#AE496F', onColor: '#FFFFFF',
    area: 'KALEIDXSCOPE · FINAL SEQUENCE', openedAt: '2026-10-01T10:00:00+08:00', trackerKind: 'completion',
    prerequisites: ['hope'], completionLabel: '最终挑战已完成',
    requirements: ['通关希望之门后，国服直接开启最终挑战', '完成 Xaleid◆scopiX 的两段挑战，迎来 ALL COMPLETE'],
    trackerNote: '完成最终挑战后手动标记，不会自动改写其他阶段的记录。',
    challenge: {
      kind: 'final-single',
      song: { id: '11820', title: 'Xaleid◆scopiX', chartType: 'DX' },
      endingSong: { id: '11821', title: 'Ref:rain (for 7th Heaven)', chartType: 'DX' },
      partner: 'Ris（リズ）',
      mechanics: [
        '本次挑战只有一首课题曲，包含前半 LIFE 与后半 DX LIFE 两段。',
        '前半采用通常扣血规则；到达中途演出后恢复生命，继续后半段。',
        '后半段除 Critical Perfect 外的判定均会扣血。国服各档 DX LIFE 与具体扣血值未完整核实，待确认。',
        '开放时最低要求 Re:MASTER，后续降难度与 LIFE 缓和见推算参考；实际条件以机台为准。',
      ],
    },
    gateSchedule: {
      label: '最终挑战', switchLabel: '推算按北京时间 04:00 切换',
      evidence: { status: 'estimated', source: awmcReference('FINAL') },
      phases: phases('04', [
        ['10-01', '10-03', 'Re:MASTER', 1], ['10-03', '10-05', 'Re:MASTER', 5],
        ['10-05', '10-06', 'Re:MASTER', 10], ['10-06', '10-07', 'Re:MASTER', 30],
        ['10-07', '10-11', 'MASTER', 30], ['10-11', '10-13', 'MASTER', 50],
        ['10-13', '10-15', 'MASTER', 100], ['10-15', '10-22', 'EXPERT', 100],
        ['10-22', null, 'BASIC', 999],
      ]).map((phase) => ({ ...phase, dxLife: phase.difficulty === 'EXPERT' ? 999 : null })),
    },
    references: [awmcReference('FINAL')],
  },
];

export const KALEIDX_STAGES: readonly KaleidxStage[] = [...KALEIDX_GATES, ...KALEIDX_FINALES];
export const KALEIDX_STAGES_BY_ID = Object.fromEntries(
  KALEIDX_STAGES.map((stage) => [stage.id, stage]),
) as Record<KaleidxStageId, KaleidxStage>;

export function kaleidxStageChallenge(stage: KaleidxStage): KaleidxChallenge {
  return stage.trackerKind === 'completion' ? stage.challenge : {
    kind: 'random-three', track1: stage.track1, track2: stage.track2, track3: stage.track3,
  };
}

export function resolveKaleidxSchedulePhase(
  schedule: KaleidxSchedule,
  at: Date = new Date(),
): KaleidxSchedulePhase | null {
  if (schedule.evidence?.status === 'estimated') return null;
  const time = at.getTime();
  return schedule.phases.find((phase) => {
    const start = Date.parse(phase.startsAt);
    const end = phase.endsAt ? Date.parse(phase.endsAt) : Number.POSITIVE_INFINITY;
    return time >= start && time < end;
  }) ?? null;
}
