/**
 * 結算畫面配置檔
 * 這裡只存放「純數據」，方便隨時微調視覺節奏
 */

export const RESULT_TIMING = {
    TITLE_TO_WINNER: 600,
    WINNER_TO_YAKU: 500,
    YAKU_INTERVAL: 400,
    YAKU_DURATION: 400,
    YAKU_TO_HAND: 300,
    HAND_TO_SCORE: 300,
    PHASE0_TO_PHASE1: 600,
    SCORE_TO_LEVEL: 600,
    LEVEL_TO_HINT: 900,
    LEVEL_STAMP_DURATION: 650,
    LEVEL_STAMP_DROP: 56,
    LEVEL_HIGHLIGHT_DELAY: 150
};

export const RESULT_LAYOUT_CONFIG = {
    yakuLineHeight: 45,
    yakuItemsPerCol: 4,
    yakuColWidth: 250
};

export const YAKU_DEFS = {
  ORDER: [
    "天和", "地和", "人和", 
    "四暗刻", "四暗刻單騎",
    "綠一色", "大竹林",
    "四槓子", "金門橋",
    "九蓮寶燈", "純正九蓮寶燈",
    "石上三年",
    "立直", "兩立直",
    "一發", "門前清自摸和",
    "燕返", "槓振", "嶺上開花", 
    "海底摸月", "河底撈魚", 
    "斷么九", "一盃口", "平和",
    "一氣通貫", "三槓子", 
    "對對和", "三暗刻",
    "七對子", "純全帶么九", 
    "二盃口", "清一色"
    ],
    YAKUMAN: new Set([
      "天和", "地和", "人和", 
      "四暗刻", "四暗刻單騎",
      "綠一色", "大竹林", 
      "四槓子", "金門橋",
      "九蓮寶燈", "純正九蓮寶燈",
      "石上三年"
    ])
};
