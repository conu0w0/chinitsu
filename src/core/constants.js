export const GAME_CONFIG = {
    TOTAL_TILES: 36,      // 總張數 (1~9索 各4張)
    WALL_DEAD_SIZE: 0,    // 無王牌/嶺上牌保留區 (嶺上牌直接從牌山摸)
    HAND_SIZE: 13,        // 標準手牌數
    
    // 分數設定
    STARTING_SCORE: 150000,
    YAKUMAN_SCORE: 32000, // 犯規 (Chombo) 需支付役滿點 (假設為莊家役滿或統一 32000)
    RIICHI_BET: 0,        // 立直不需要供托 (規則設定)
    
    // 遊戲流動
    MIN_TILES_LEFT: 0,    // 牌山剩 0 張即流局
};

export const YAKU = {
    // === 一般役 ===
    RIICHI:         { name: '立直', han: 1 },
    TSUMO:          { name: '門前清自摸和', han: 1 },
    IPPATSU:        { name: '一發', han: 1 },
    PINFU:          { name: '平和', han: 1 },
    IIPEIKO:        { name: '一盃口', han: 1 },
    TANYAO:         { name: '斷么九', han: 1 },
    RINSHAN:        { name: '嶺上開花', han: 1 },
    CHANKAN:        { name: '槍槓', han: 1 },
    HAITEI:         { name: '海底撈月', han: 1 },
    HOUTEI:         { name: '河底撈魚', han: 1 },
    TSUBAME:        { name: '燕返', han: 1 },
    KANBURI:        { name: '槓振', han: 1 },

    DOUBLE_RIICHI:  { name: '雙立直', han: 2 },
    TOITOI:         { name: '對對和', han: 2 },
    SANANKOU:       { name: '三暗刻', han: 2 },
    SANKANTSU:      { name: '三槓子', han: 2 },
    CHIITOI:        { name: '七對子', han: 2 }, // 25符
    ITTSU:          { name: '一氣通貫', han: 2 }, 
    RYANPEIKO:      { name: '二盃口', han: 3 },
    JUNCHAN:        { name: '純全帶么九', han: 3 },
    CHINITSU:       { name: '清一色', han: 6 }, 

    // === 役滿類 (value 代表倍數) ===
    TENHOU:         { name: '天和', han: 0, yakuman: 1 },
    CHIHOU:         { name: '地和', han: 0, yakuman: 1 },
    RENHOU:         { name: '人和', han: 0, yakuman: 1 },

    SUUANKOU:       { name: '四暗刻', han: 0, yakuman: 1 },
    SUUANKOU_TANKI: { name: '四暗刻單騎', han: 0, yakuman: 2 }, // 雙倍
    SUUKANTSU:      { name: '四槓子', han: 0, yakuman: 1 },
    RYUUIISOU:      { name: '綠一色', han: 0, yakuman: 1 },
    CHUUREN:        { name: '九蓮寶燈', han: 0, yakuman: 1 },
    CHUUREN_PURE:   { name: '純正九蓮寶燈', han: 0, yakuman: 2 }, // 雙倍
    
    GOLDEN_GATE:    { name: '金門橋', han: 0, yakuman: 1 }, // 123 345 567 789
    DAI_CHIKURIN:   { name: '大竹林', han: 0, yakuman: 1 }, // 2~8 的七對子
};
