/**
 * 判斷聽牌類型 (可能同時符合多種，例如 4566 榮和 6)
 * 用於高點法 (Takame) 判定
 * @param {Object} pattern - 拆解後的牌型 { head, mentsu: [] }
 * @param {number} winTile - 和了牌
 * @returns {Array<string>} 回傳所有可能的聽牌種類 ['tanki', 'ryanmen', 'shanpon', 'kanchan', 'penchan']
 */
export function getWaitTypes(pattern, winTile) {
    const waitTypes = new Set();

    // 1. 檢查是否可解釋為：單騎 (Tanki)
    // 條件：和了牌構成了雀頭
    if (pattern.head === winTile) {
        waitTypes.add('tanki');
    }

    // 2. 檢查是否可解釋為：面子聽牌 (Run/Triplet)
    // 條件：和了牌存在於某個面子中
    for (const m of pattern.mentsu) {
        // 如果這個面子不包含和了牌，跳過
        if (!m.tiles.includes(winTile)) continue;

        if (m.type === 'triplet') {
            // 刻子聽牌必為雙碰 (Shanpon)
            // 除非是特殊規則，否則標準麻將中，刻子聽牌就是雙碰
            waitTypes.add('shanpon');
        } 
        else if (m.type === 'run') {
            const start = m.start; 
            // 順子結構 [start, start+1, start+2]
            
            // 嵌張 (Kanchan): 4-6 聽 5
            if (winTile === start + 1) {
                waitTypes.add('kanchan');
            }
            // 邊張 (Penchan): 1-2 聽 3 或 8-9 聽 7
            else if ((start === 1 && winTile === 3) || (start === 7 && winTile === 7)) {
                waitTypes.add('penchan');
            }
            // 兩面 (Ryanmen)
            else {
                waitTypes.add('ryanmen');
            }
        }
    }

    // 防呆：如果邏輯上既不是雀頭也不是面子 (理論上不應發生，除非 pattern 錯誤)
    if (waitTypes.size === 0) {
        waitTypes.add('tanki');
    }

    return [...waitTypes];
}

/**
 * 計算符數
 * @param {Object} pattern - 牌型拆解
 * @param {number} winTile - 和了牌
 * @param {Object} ctx - 上下文 (isTsumo, isRiichi, wind info...)
 * @param {string} specificWait - 指定的聽牌型 (由外部迴圈傳入，如 'ryanmen' 或 'tanki')
 * @returns {number} 符數 (如 30, 40, 50...)
 */
export function calculateFu(pattern, winTile, ctx, specificWait) {
    // 1. 七對子固定 25 符
    // (注意：七對子通常在外層就會被攔截，但若流進這裡，需處理)
    if (pattern.mentsu.length === 0 && Array.isArray(pattern.head)) {
         return 25;
    }
    // 或是根據你的 patternLogic，七對子可能有不同的結構，這裡假設一般型

    let fu = 20; // 副底

    // 2. 門前加符 / 自摸加符
    // 假設 ctx.isOpen 代表是否有副露 (明槓/吃/碰)
    if (ctx.isTsumo) {
        fu += 2; // 自摸 +2
        // 例外：平和自摸通常是 20 符 (若不採計自摸2符)，但在計算翻數時會處理 (Tsumo 1翻)
        // 這裡回傳標準符數計算即可
    } else {
        // 榮和
        if (!ctx.isOpen) {
            fu += 10; // 門前清榮和 +10
        }
        // 若有副露榮和，無加符
    }

    // 3. 聽牌型加符 (單騎、嵌張、邊張 +2)
    if (['kanchan', 'penchan', 'tanki'].includes(specificWait)) {
        fu += 2;
    }

    // 4. 面子加符 (刻子、槓子)
    for (const m of pattern.mentsu) {
        if (m.type === 'run') continue; // 順子 0 符

        if (m.type === 'triplet') {
            // 判斷 么九 (1,9) 還是 中張 (2-8)
            // 注意：這裡假設清一色數字牌，若有字牌需額外判斷
            const isYaochu = m.tiles.some(t => t === 1 || t === 9);
            
            let base = isYaochu ? 8 : 4; // 么九刻 8, 中張刻 4

            // 判斷 明刻 還是 暗刻
            // 1. 如果已經副露 (m.isOpen 或 m.ankan=false 且非手牌)，則算明刻 (除以2)
            // 2. 如果是手牌內的刻子：
            //    - 自摸：全部視為暗刻
            //    - 榮和：如果這是「和了的那組刻子」且聽牌型是「雙碰」，視為明刻。其他的視為暗刻。
            
            let isAnkou = true;

            // 如果該面子標記為已副露 (吃碰)
            if (m.isOpen) isAnkou = false;
            
            // 如果是暗槓，必定是暗的 (且分數會在下面槓子邏輯加倍，這裡先算刻子基底)
            // 但通常槓子有獨立邏輯，這裡假設 triplet type 包含了槓
            
            // 處理榮和時的明暗判定
            if (!ctx.isTsumo && !m.isOpen && !m.ankan) {
                // 如果這組刻子包含和了牌，且是雙碰聽牌 -> 視為明刻
                if (m.tiles.includes(winTile) && specificWait === 'shanpon') {
                    isAnkou = false;
                }
            }

            if (!isAnkou) base /= 2;

            // 處理槓子 (槓子是刻子的 4 倍)
            if (m.isKan) base *= 4;

            fu += base;
        }
    }

    // 6. 進位 (無條件進位到 10)
    // 22 -> 30, 20 -> 20
    if (fu === 20 && !ctx.isOpen && !ctx.isTsumo) {
        // 特例：平和門清榮和雖計算為 30 符 (20副底+10門清)，但有時會被視為固定 30
        // 公式算出來就是 30，沒問題
    }

    return Math.ceil(fu / 10) * 10;
}
