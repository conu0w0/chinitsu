export function winCheck(hand) {
  if (!Array.isArray(hand) || hand.length !== 14) {
    return { win: false, forms: [] };
  }

  // 排序（非常重要）
  const tiles = [...hand].sort((a, b) => a - b);

  const forms = [];

  // 七對子
  if (isChitoitsu(tiles)) {
    forms.push("chitoitsu");
  }

  // 特殊役滿結構（先判，避免被一般型吞掉）
  if (isJunseiChuuren(tiles)) {
    forms.push("junsei_chuurenpoutou");
  } else if (isChuuren(tiles)) {
    forms.push("chuurenpoutou");
  }

  if (isDaichikurin(tiles)) {
    forms.push("daichikurin");
  }

  if (isGoldenGateBridge(tiles)) {
    forms.push("golden_gate_bridge");
  }

  // 一般型（4 面子 + 1 對）
  if (isMentsuHand(tiles)) {
    forms.push("mentsu");

    // 4️⃣ 二盃口（必須建立在一般型上）
    if (isRyanpeikou(tiles)) {
      forms.push("ryanpeikou");
    }
  }

  return {
    win: forms.length > 0,
    forms,
  };
}

function isMentsuHand(tiles) {
  const count = toCountMap(tiles);

  // 嘗試每一種可能的雀頭
  for (const t in count) {
    if (count[t] >= 2) {
      // 拿掉雀頭
      count[t] -= 2;

      if (canFormMentsu(count)) {
        count[t] += 2;
        return true;
      }

      // 還原
      count[t] += 2;
    }
  }
  return false;
}

function canFormMentsu(count) {
  // 找第一個還有牌的數字
  let tile = null;
  for (let i = 1; i <= 9; i++) {
    if (count[i] > 0) {
      tile = i;
      break;
    }
  }

  // 全部用完了 → 成功
  if (tile === null) return true;

  // 嘗試刻子
  if (count[tile] >= 3) {
    count[tile] -= 3;
    if (canFormMentsu(count)) {
      count[tile] += 3;
      return true;
    }
    count[tile] += 3;
  }

  // 嘗試順子
  if (
    tile <= 7 &&
    count[tile + 1] > 0 &&
    count[tile + 2] > 0
  ) {
    count[tile]--;
    count[tile + 1]--;
    count[tile + 2]--;
    if (canFormMentsu(count)) {
      count[tile]++;
      count[tile + 1]++;
      count[tile + 2]++;
      return true;
    }
    count[tile]++;
    count[tile + 1]++;
    count[tile + 2]++;
  }

  return false;
}

function toCountMap(tiles) {
  const count = {};
  for (const t of tiles) {
    count[t] = (count[t] || 0) + 1;
  }
  return count;
}

function isRyanpeikou(tiles) {
  const count = toCountMap(tiles);

  for (const t in count) {
    if (count[t] >= 2) {
      count[t] -= 2;

      const results = [];
      collectMentsu(count, [], results);

      count[t] += 2;

      for (const mentsu of results) {
        // 只看順子
        const shuntsu = mentsu.filter(m => m.type === "shuntsu");

        if (shuntsu.length !== 4) continue;

        const map = {};
        for (const s of shuntsu) {
          const key = s.tiles.join("-");
          map[key] = (map[key] || 0) + 1;
        }

        const pairs = Object.values(map).filter(v => v >= 2);
        if (pairs.length >= 2) {
          return true;
        }
      }
    }
  }
  return false;
}

function collectMentsu(count, current, results) {
  let tile = null;
  for (let i = 1; i <= 9; i++) {
    if (count[i] > 0) {
      tile = i;
      break;
    }
  }

  if (tile === null) {
    results.push([...current]);
    return;
  }

  // 刻子
  if (count[tile] >= 3) {
    count[tile] -= 3;
    current.push({ type: "koutsu", tiles: [tile, tile, tile] });
    collectMentsu(count, current, results);
    current.pop();
    count[tile] += 3;
  }

  // 順子
  if (tile <= 7 && count[tile + 1] > 0 && count[tile + 2] > 0) {
    count[tile]--;
    count[tile + 1]--;
    count[tile + 2]--;
    current.push({
      type: "shuntsu",
      tiles: [tile, tile + 1, tile + 2],
    });
    collectMentsu(count, current, results);
    current.pop();
    count[tile]++;
    count[tile + 1]++;
    count[tile + 2]++;
  }
}

