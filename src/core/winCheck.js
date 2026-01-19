export function calculateResult(handTiles, winTile, ctx = {}) {
  const tiles = [...handTiles, winTile].sort((a,b)=>a-b);
  const counts = countTiles(tiles);
  const ankanTiles = ctx.ankanTiles || [];

  // A. 全牌型役滿（先算，不 return）
  const baseYakuman = checkYakumanByTiles(tiles, counts);

  // B. 七對子
  if (isChiitoitsu(counts)) {
    return finalize({
      yakuman: baseYakuman,
      yaku: [YAKU.CHIITOI, YAKU.CHINITSU],
    });
  }

  // C. 一般型（含四槓子）
  const patterns = getAgariPatterns(tiles, ankanTiles);
  if (!patterns.length) return null;

  let best = null;

  for (const p of patterns) {
    const r = calcFromPattern(p, tiles, winTile, ctx);

    const totalYakuman =
      baseYakuman.reduce((s,y)=>s+y.yakuman,0) +
      r.yakuman.reduce((s,y)=>s+y.yakuman,0);

    if (
      !best ||
      totalYakuman > best.totalYakuman ||
      (totalYakuman === best.totalYakuman && r.han > best.han)
    ) {
      best = {
        yakuman: [...baseYakuman, ...r.yakuman],
        yaku: r.yaku,
        han: r.han,
        totalYakuman
      };
    }
  }

  return finalize(best);
}

function calcFromPattern(p, tiles, winTile, ctx) {
  let yakuman = [];
  let yaku = [YAKU.CHINITSU];

  const runs = p.mentsu.filter(m=>m.type==='run');
  const trips = p.mentsu.filter(m=>m.type==='triplet');

  // ---------- 四暗刻 / 四暗刻單騎 ----------
  const ankou = trips.filter(t=>t.ankan && !t.isKan).length;
  const wait = getWaitType(p, winTile);

  if (ankou === 4) {
    if (wait === 'tanki') {
      yakuman.push(YAKU.SUUANKOU_TANKI);
    } else {
      yakuman.push(YAKU.SUUANKOU);
    }
  }

  // ---------- 四槓子 ----------
  const kanCount = trips.filter(t=>t.isKan).length;
  if (kanCount === 4) {
    yakuman.push(YAKU.SUUKANTSU);
    yakuman.push(YAKU.SUUANKOU_TANKI);
}


  // ---------- 金門橋 ----------
  const starts = runs.map(r=>r.start);
  if ([1,3,5,7].every(s=>starts.includes(s))) {
    yakuman.push(YAKU.GOLDEN_GATE);
  }

  // ===== 以下才是一般役 =====
  if (ctx.isRiichi) yaku.push(YAKU.RIICHI);
  if (ctx.isTsumo) yaku.push(YAKU.TSUMO);
  if (isTanyao(tiles)) yaku.push(YAKU.TANYAO);

  // 平和
  if (!trips.length && wait === 'ryanmen') {
    yaku.push(YAKU.PINFU);
  }

  // 一盃口 / 二盃口
  const peiko = countPeiko(runs);
  if (peiko === 1) yaku.push(YAKU.IIPEIKO);
  if (peiko === 2) yaku.push(YAKU.RYANPEIKO);

  // 一氣通貫
  if ([1,4,7].every(s=>starts.includes(s))) {
    yaku.push(YAKU.ITTSU);
  }

  // 純全帶么九
  if (isJunchan(p)) yaku.push(YAKU.JUNCHAN);

  const han = yaku.reduce((s,y)=>s+y.han,0);

  return { yakuman, yaku, han };
}

function checkYakumanByTiles(tiles, c) {
  let res = [];

  // 綠一色
  if (tiles.every(t=>[2,3,4,6,8].includes(t))) {
    res.push(YAKU.RYUUIISOU);
  }

  // 大竹林
  if ([2,3,4,5,6,7,8].every(n=>c[n]===2)) {
    res.push(YAKU.DAI_CHIKURIN);
  }

  // 九蓮
  if (
    c[1]>=3 && c[9]>=3 &&
    [2,3,4,5,6,7,8].every(n=>c[n]>=1)
  ) {
    const pure =
      tiles.length===14 &&
      c[1]===3 && c[9]===3 &&
      [2,3,4,5,6,7,8].every(n=>c[n]===1);
    res.push(pure ? YAKU.CHUUREN_PURE : YAKU.CHUUREN);
  }

  return res;
}
