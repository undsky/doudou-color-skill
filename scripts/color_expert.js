#!/usr/bin/env node
/**
 * 中国传统色专业色彩顾问计算引擎 (color_expert.js)
 * 基于 526 种中国传统色权威数据 (colors.json)
 * 提供：色谱检索、CIE LAB Delta-E 感知匹配、色彩和弦推导、60-30-10 UI 配色生成与 CSS 导出
 */

const fs = require('fs');
const path = require('path');

// 加载 colors.json (优先当前 scripts/ 目录，兼顾根目录)
let colorsPath = path.resolve(__dirname, './colors.json');
if (!fs.existsSync(colorsPath)) {
  colorsPath = path.resolve(__dirname, '../colors.json');
}
if (!fs.existsSync(colorsPath)) {
  console.error(`错误：未找到 colors.json 数据文件（已检查 scripts/ 及上一级根目录）。`);
  process.exit(1);
}

const rawColors = JSON.parse(fs.readFileSync(colorsPath, 'utf8'));

// -----------------------------------------------------------------------------
// 色彩空间转换数学工具 (RGB <-> XYZ <-> LAB, RGB <-> HSL)
// -----------------------------------------------------------------------------

function hexToRgb(hex) {
  let c = hex.trim().replace(/^#/, '');
  if (c.length === 3) {
    c = c.split('').map(x => x + x).join('');
  }
  const num = parseInt(c, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex([r, g, b]) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
}

function rgbToXyz(r, g, b) {
  r = r / 255; g = g / 255; b = b / 255;
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  r *= 100; g *= 100; b *= 100;
  const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = r * 0.0193 + g * 0.1192 + b * 0.9505;
  return [x, y, z];
}

function xyzToLab(x, y, z) {
  x /= 95.047; y /= 100.000; z /= 108.883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + (16 / 116));
  const fx = f(x), fy = f(y), fz = f(z);
  return [(116 * fy) - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function rgbToLab(rgb) {
  const [x, y, z] = rgbToXyz(...rgb);
  return xyzToLab(x, y, z);
}

// CIE76 色差公式 Delta-E
function deltaE(lab1, lab2) {
  return Math.sqrt(
    Math.pow(lab1[0] - lab2[0], 2) +
    Math.pow(lab1[1] - lab2[1], 2) +
    Math.pow(lab1[2] - lab2[2], 2)
  );
}

// 相对亮度计算 (用于 WCAG 对比度)
function getLuminance([r, g, b]) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

// 计算两者之间的对比度 (1:1 到 21:1)
function getContrastRatio(rgb1, rgb2) {
  const lum1 = getLuminance(rgb1);
  const lum2 = getLuminance(rgb2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

// -----------------------------------------------------------------------------
// 预计算传统色库 LAB 数据与五行/色系标注
// -----------------------------------------------------------------------------

function determineWuxing(h, s, l) {
  if (s < 12 && l > 75) return '金 (素白/纯净)';
  if (s < 15 && l < 30) return '水 (玄黑/幽微)';
  if (h >= 330 || h < 25) return '火 (赤红/热情)';
  if (h >= 25 && h < 65) return '土 (黄褐/包容)';
  if (h >= 65 && h < 175) return '木 (青绿/生机)';
  if (h >= 175 && h < 265) return '水 (靛蓝/深沉)';
  if (h >= 265 && h < 330) return '木/火 (紫绛/尊贵)';
  return '中和';
}

const colorDatabase = rawColors.map(c => {
  const hsl = rgbToHsl(c.RGB);
  return {
    ...c,
    hsl,
    lab: rgbToLab(c.RGB),
    wuxing: determineWuxing(hsl[0], hsl[1], hsl[2])
  };
});

// -----------------------------------------------------------------------------
// 核心业务功能
// -----------------------------------------------------------------------------

/**
 * 在 526 国色中找到感知最相近的颜色
 */
function findClosestColor(targetRgb, filterFn = null) {
  const targetLab = rgbToLab(targetRgb);
  let minD = Infinity;
  let best = null;

  for (const c of colorDatabase) {
    if (filterFn && !filterFn(c)) continue;
    const d = deltaE(targetLab, c.lab);
    if (d < minD) {
      minD = d;
      best = c;
    }
  }
  return { color: best, distance: minD };
}

// 经典国色雅称/别名映射表（增强对常见文人雅称的包容与精准映射）
const colorAliases = {
  '天青': '霁青',
  '玄青': '钢青',
  '玄黑': '燕颔蓝',
  '玄色': '钢青',
  '墨黑': '燕颔蓝',
  '朱砂': '银朱',
  '竹青': '葱绿',
  '霁蓝': '景泰蓝',
  '青花': '群青',
  '黛色': '钢青',
  '黛蓝': '鷃蓝',
  '秋香': '秋葵黄',
  '胭脂': '胭脂红',
  '赭石': '山鸡褐',
  '雄黄': '雄黄',
  '藤黄': '藤黄',
  '苍色': '苍绿',
  '鸦青': '燕颔蓝',
  '琉璃黄': '金叶黄',
  '汝窑青': '艾绿'
};

/**
 * 模糊或精确搜索颜色（中文名、拼音、HEX、别名）
 */
function searchColors(keyword) {
  const kw = keyword.toLowerCase().trim();
  if (kw.startsWith('#')) {
    const rgb = hexToRgb(kw);
    const closest = findClosestColor(rgb);
    return [{ ...closest.color, matchType: `最相近色 (色差 ΔE=${closest.distance.toFixed(1)})` }];
  }

  // 1. 别名/同义词映射
  const mappedName = colorAliases[keyword] || colorAliases[kw];
  if (mappedName) {
    const foundByAlias = colorDatabase.filter(c => c.name === mappedName);
    if (foundByAlias.length > 0) {
      return foundByAlias.map(c => ({
        ...c,
        matchType: `雅称映射 [${keyword} -> ${mappedName}]`
      }));
    }
  }

  // 2. 精确搜索
  const exact = colorDatabase.filter(c => c.name === kw || c.pinyin === kw || c.hex.toLowerCase() === kw);
  if (exact.length > 0) return exact;

  // 3. 模糊匹配
  return colorDatabase.filter(c =>
    c.name.includes(kw) ||
    c.pinyin.includes(kw)
  );
}

/**
 * 基于基准色推导现代色彩和弦（并投影回国色库）
 */
function generateHarmony(baseColor, type = 'all') {
  const [h, s, l] = baseColor.hsl;

  // 辅助函数：根据目标 HSL 找到国色库中最近的正色
  const pick = (targetH, targetS, targetL, excludeNames = []) => {
    const targetRgb = hslToRgb([targetH, targetS, targetL]);
    const res = findClosestColor(targetRgb, c => !excludeNames.includes(c.name));
    return res.color;
  };

  const results = {};

  // 1. 互补色 (Complementary, 180°)
  if (type === 'all' || type === 'complementary' || type === 'comp') {
    const comp = pick((h + 180) % 360, s, l, [baseColor.name]);
    results.complementary = {
      name: '互补对撞 (Complementary)',
      desc: '180° 对立色相，形成鲜明夺目的视觉张力与气场对冲',
      colors: [baseColor, comp]
    };
  }

  // 2. 邻近色 (Analogous, ±30°)
  if (type === 'all' || type === 'analogous') {
    const left = pick((h - 30 + 360) % 360, s, l, [baseColor.name]);
    const right = pick((h + 30) % 360, s, l, [baseColor.name, left.name]);
    results.analogous = {
      name: '相邻融洽 (Analogous)',
      desc: '同象限邻近色相，自然和谐、流转温润，极具东方渐变意蕴',
      colors: [left, baseColor, right]
    };
  }

  // 3. 三色和弦 (Triadic, 120°)
  if (type === 'all' || type === 'triadic') {
    const t1 = pick((h + 120) % 360, s, l, [baseColor.name]);
    const t2 = pick((h + 240) % 360, s, l, [baseColor.name, t1.name]);
    results.triadic = {
      name: '三相均衡 (Triadic)',
      desc: '在色相环上构成正三角形，色彩饱满丰富且保持动态平衡',
      colors: [baseColor, t1, t2]
    };
  }

  // 4. 分裂互补色 (Split-Complementary, 150° & 210°)
  if (type === 'all' || type === 'split') {
    const s1 = pick((h + 150) % 360, s, l, [baseColor.name]);
    const s2 = pick((h + 210) % 360, s, l, [baseColor.name, s1.name]);
    results.split = {
      name: '分裂互补 (Split-Complementary)',
      desc: '兼顾对比张力与优雅退让，比直接互补更为柔和典雅',
      colors: [baseColor, s1, s2]
    };
  }

  // 5. 单色阶梯 (Monochromatic)
  if (type === 'all' || type === 'monochromatic' || type === 'mono') {
    const deep = pick(h, Math.min(100, s * 1.1), Math.max(15, l * 0.5), [baseColor.name]);
    const light = pick(h, Math.max(10, s * 0.7), Math.min(92, l * 1.4 + 15), [baseColor.name, deep.name]);
    const lightest = pick(h, Math.max(5, s * 0.4), Math.min(97, l * 1.6 + 25), [baseColor.name, deep.name, light.name]);
    results.monochromatic = {
      name: '同色阶梯 (Monochromatic)',
      desc: '同色系不同明度深浅递进，如水墨晕染，层峦叠嶂',
      colors: [deep, baseColor, light, lightest]
    };
  }

  return results;
}

/**
 * 生成 60-30-10 UI 规范全套配色方案
 */
function generateUiPalette(baseColor, mode = 'light') {
  const [h, s, l] = baseColor.hsl;

  // 主色 (Primary)
  const primary = baseColor;

  // 辅助色 (Secondary: 邻近或低饱和过渡)
  const secCandidate = findClosestColor(hslToRgb([(h + 25) % 360, Math.max(20, s * 0.7), Math.min(65, l)]), c => c.name !== primary.name);
  const secondary = secCandidate.color;

  // 点缀强调色 (Accent: 150°~180° 对比色)
  const accentCandidate = findClosestColor(hslToRgb([(h + 160) % 360, Math.min(100, Math.max(65, s)), Math.min(60, Math.max(40, l))]), c => c.name !== primary.name && c.name !== secondary.name);
  const accent = accentCandidate.color;

  let bg, surface, textPrimary, textMuted, border;

  if (mode === 'light') {
    // 浅色模式：以米宣、象牙白、汉白玉或浅竹色为底
    const bgCandidate = findClosestColor([250, 248, 245], c => rgbToHsl(c.RGB)[2] > 92);
    bg = bgCandidate.color;
    surface = { name: '纯素白 (Surface)', hex: '#ffffff', RGB: [255, 255, 255], CMYK: [0, 0, 0, 0], pinyin: 'subai' };
    
    // 文本色：选择深墨或水牛灰
    const textCandidate = findClosestColor([33, 33, 38], c => rgbToHsl(c.RGB)[2] < 20);
    textPrimary = textCandidate.color;
    textMuted = findClosestColor([100, 105, 110], c => {
      const lVal = rgbToHsl(c.RGB)[2];
      return lVal >= 38 && lVal <= 48;
    }).color;
    border = findClosestColor([225, 222, 218], c => rgbToHsl(c.RGB)[2] > 84).color;
  } else {
    // 暗黑模式：以深海墨、云杉绿或玄青为底
    const bgCandidate = findClosestColor([18, 20, 24], c => rgbToHsl(c.RGB)[2] < 12);
    bg = bgCandidate.color;
    surface = findClosestColor([28, 32, 38], c => {
      const lVal = rgbToHsl(c.RGB)[2];
      return lVal >= 10 && lVal <= 18;
    }).color;
    
    textPrimary = { name: '羊脂白 (Text)', hex: '#f6f7f8', RGB: [246, 247, 248], CMYK: [1, 0, 0, 3], pinyin: 'yangzhibai' };
    textMuted = findClosestColor([155, 160, 165], c => {
      const lVal = rgbToHsl(c.RGB)[2];
      return lVal >= 60 && lVal <= 72;
    }).color;
    border = findClosestColor([45, 50, 58], c => {
      const lVal = rgbToHsl(c.RGB)[2];
      return lVal >= 18 && lVal <= 26;
    }).color;
  }

  // 计算无障碍对比度
  const primaryOnBg = getContrastRatio(primary.RGB, bg.RGB).toFixed(2);
  const textOnBg = getContrastRatio(textPrimary.RGB, bg.RGB).toFixed(2);
  const accentOnBg = getContrastRatio(accent.RGB, bg.RGB).toFixed(2);

  return {
    mode,
    baseColor,
    ratio: {
      background: { role: '60% 背景底色 (Background)', color: bg, usage: '页面底衬、大面积背景画布' },
      surface: { role: '表面卡片 (Surface)', color: surface, usage: '卡片容器、导航栏底栏、模态弹窗' },
      primary: { role: '30% 主体色 (Primary)', color: primary, usage: '品牌主按钮、激活状态、重要标题、核心图表' },
      secondary: { role: '辅助次要色 (Secondary)', color: secondary, usage: '次级按钮、标签徽章、次要插画区块' },
      accent: { role: '10% 点睛色 (Accent)', color: accent, usage: 'CTA 转化按钮、高亮提示徽标、微交互动效' },
      textPrimary: { role: '主正文文本 (Text Primary)', color: textPrimary, usage: '正文排版、主要标题文字' },
      textMuted: { role: '次级说明文本 (Text Muted)', color: textMuted, usage: '辅助说明、时间戳、次级操作' },
      border: { role: '边界分割线 (Border)', color: border, usage: '分割线、卡片边框、输入框描边' }
    },
    accessibility: {
      primaryOnBgRatio: `${primaryOnBg}:1 (${primaryOnBg >= 4.5 ? '✓ 满足 AA+' : '⚠ 建议用于大字号或增加明暗差'})`,
      textOnBgRatio: `${textOnBg}:1 (${textOnBg >= 4.5 ? '✓ 完美满足 AAA 级无障碍阅读' : '⚠ 建议调深文本'})`,
      accentOnBgRatio: `${accentOnBg}:1`
    }
  };
}

/**
 * 经典国色预置主题谱库
 */
const classicThemes = {
  gugong: {
    name: '故宫宫廷 · 金碧红墙',
    keywords: ['故宫', '宫廷', '皇家', '华贵', '紫禁城'],
    concept: '朱墙丹柱，金瓦琉璃。尽显紫禁六百年庄穆威仪与皇室极尊气象。',
    colors: ['大红', '金叶黄', '钢青', '月白', '霁青']
  },
  dunhuang: {
    name: '敦煌莫高 · 岁蚀重彩',
    keywords: ['敦煌', '壁画', '莫高窟', '飞天', '西域', '风蚀'],
    concept: '千年石窟壁画，以石绿、矿青、赭石交相辉映，粗粝而旷达。',
    colors: ['落霞红', '青矾绿', '山鸡褐', '篾黄', '群青']
  },
  songci: {
    name: '宋代汝窑 · 雨过天青',
    keywords: ['宋代', '汝窑', '青瓷', '天青', '极简', '素雅', '文人'],
    concept: '雨过天青云破处，这般颜色做将来。极致克制、温润如玉的文人至高审美。',
    colors: ['远天蓝', '艾绿', '月影白', '长石灰', '玉簪绿']
  },
  jiangnan: {
    name: '江南水乡 · 烟雨墨韵',
    keywords: ['江南', '水乡', '烟雨', '白墙黛瓦', '墨韵', '温婉'],
    concept: '水墨写意，黛瓦粉墙，雾气氤氲。温和内敛的江南诗情与画意。',
    colors: ['粉白', '青灰', '鷃蓝', '淡青紫', '葱绿']
  },
  shanshui: {
    name: '千里江山 · 咫尺青绿',
    keywords: ['千里江山', '山水', '青绿', '王希孟', '国画'],
    concept: '层峦叠嶂，浓墨重彩。石青与石绿的绝妙碰撞，挥洒出泱泱华夏锦绣山河。',
    colors: ['群青', '翠绿', '孔雀绿', '栀子黄', '檀紫']
  },
  tangfeng: {
    name: '大唐盛世 · 浓艳华章',
    keywords: ['大唐', '唐风', '盛唐', '华彩', '浓郁', '富贵', '牡丹'],
    concept: '胡风汉韵，万国来朝。浓烈绚烂的牡丹红与璨金交织，热情而磅礴。',
    colors: ['大红', '金盏黄', '魏紫', '孔雀蓝', '象牙白']
  },
  seasons: {
    name: '四时雅韵 · 二十四节气',
    keywords: ['四时', '节气', '春夏秋冬', '自然'],
    concept: '顺应四时节序流转，春生柳黄、夏炽朱明、秋爽素金、冬藏玄黛。',
    colors: ['芽绿', '晨曦红', '秋葵黄', '雪白', '暗蓝']
  }
};

function getThemePalette(themeKey) {
  let theme = classicThemes[themeKey];
  if (!theme) {
    // 尝试关键词匹配
    const foundKey = Object.keys(classicThemes).find(k =>
      classicThemes[k].name.includes(themeKey) ||
      classicThemes[k].keywords.some(kw => kw.includes(themeKey))
    );
    if (foundKey) theme = classicThemes[foundKey];
  }

  if (!theme) return null;

  const matchedColors = theme.colors.map(cname => {
    const found = searchColors(cname);
    return found.length > 0 ? found[0] : null;
  }).filter(Boolean);

  return {
    ...theme,
    palette: matchedColors
  };
}

// -----------------------------------------------------------------------------
// CLI 交互与格式化展示
// -----------------------------------------------------------------------------

function formatColorCard(c) {
  return [
    `┌──────────────────────────────────────────────┐`,
    `│ ❖ 色名：${c.name.padEnd(8, ' ')} （${c.pinyin}）`,
    `│ ▫ HEX ：${c.hex}   RGB: [${c.RGB.join(', ')}]`,
    `│ ▫ CMYK：[${c.CMYK.join(', ')}] (C M Y K)`,
    `│ ▫ 五行：${c.wuxing || determineWuxing(...c.hsl)}`,
    `└──────────────────────────────────────────────┘`
  ].join('\n');
}

function exportCssTokens(uiPalette) {
  const { ratio, mode } = uiPalette;
  const lines = [
    `/* ------------------------------------------------------------ */`,
    `/* 中国传统色 UI 设计令牌 (Design Tokens) - ${mode === 'light' ? '浅色明朗模式' : '暗夜深邃模式'} */`,
    `/* 核心品牌色：${ratio.primary.color.name} (${ratio.primary.color.hex}) */`,
    `/* ------------------------------------------------------------ */`,
    `:root {`,
    `  /* 60% 背景基底 */`,
    `  --color-bg: ${ratio.background.color.hex}; /* ${ratio.background.color.name} */`,
    `  --color-surface: ${ratio.surface.color.hex}; /* ${ratio.surface.color.name} */`,
    `  --color-border: ${ratio.border.color.hex}; /* ${ratio.border.color.name} */`,
    ``,
    `  /* 30% 主体与排版 */`,
    `  --color-primary: ${ratio.primary.color.hex}; /* ${ratio.primary.color.name} */`,
    `  --color-secondary: ${ratio.secondary.color.hex}; /* ${ratio.secondary.color.name} */`,
    `  --color-text-primary: ${ratio.textPrimary.color.hex}; /* ${ratio.textPrimary.color.name} */`,
    `  --color-text-muted: ${ratio.textMuted.color.hex}; /* ${ratio.textMuted.color.name} */`,
    ``,
    `  /* 10% 点睛强调 */`,
    `  --color-accent: ${ratio.accent.color.hex}; /* ${ratio.accent.color.name} */`,
    `}`
  ];
  return lines.join('\n');
}

// 主入口运行命令解析
function printHelp() {
  console.log(`
中国传统色彩专家计算引擎 (doudou-color-expert)
===================================================
用法:
  node scripts/color_expert.js <命令> [参数...]

命令列表:
  query <名称|拼音|HEX>       查询指定传统色详情（支持模糊检索或最近色查找）
  match <HEX颜色值>           输入任意 HEX 色，智能匹配 526 种国色中最吻合的传统正色
  harmony <名称|HEX> [类型]   生成色彩和弦（complementary, analogous, triadic, split, mono, all）
  ui <名称|HEX> [light|dark]  根据主色推导 60-30-10 规范 UI 配色套件并生成设计令牌
  theme <主题名>              调取经典国色主题谱（gugong, dunhuang, songci, jiangnan, shanshui, tangfeng, seasons）
  list-themes                 查看所有内置经典主题库
  css <名称|HEX> [light|dark] 输出完整的 CSS 自定义属性变量代码
  help                        显示此帮助信息

示例:
  node scripts/color_expert.js query 霁蓝
  node scripts/color_expert.js match "#1976D2"
  node scripts/color_expert.js harmony 朱红 all
  node scripts/color_expert.js ui 天青 light
  node scripts/color_expert.js theme 宋代
  node scripts/color_expert.js css 胭脂红 light
`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === 'help' || args[0] === '-h') {
    printHelp();
    return;
  }

  const cmd = args[0].toLowerCase();

  switch (cmd) {
    case 'query': {
      const q = args[1];
      if (!q) {
        console.log('请提供查询关键词，如：node scripts/color_expert.js query 霁蓝');
        return;
      }
      const list = searchColors(q);
      if (list.length === 0) {
        console.log(`未找到与 "${q}" 匹配的传统色。`);
      } else {
        console.log(`\n找到 ${list.length} 个传统色匹配项：\n`);
        list.slice(0, 8).forEach(c => console.log(formatColorCard(c)));
      }
      break;
    }

    case 'match': {
      const hex = args[1];
      if (!hex || !hex.startsWith('#')) {
        console.log('请提供 HEX 格式颜色值，例如：#2A5CAA');
        return;
      }
      const rgb = hexToRgb(hex);
      const res = findClosestColor(rgb);
      console.log(`\n输入色：${hex}  RGB: [${rgb.join(', ')}]`);
      console.log(`🎯 最佳匹配中国传统正色（感知色差 ΔE=${res.distance.toFixed(2)}）：\n`);
      console.log(formatColorCard(res.color));
      break;
    }

    case 'harmony': {
      const q = args[1];
      const hType = args[2] || 'all';
      if (!q) {
        console.log('请提供颜色名称或 HEX，例如：node scripts/color_expert.js harmony 朱红 all');
        return;
      }
      const base = searchColors(q)[0];
      if (!base) {
        console.log(`未找到基准色 "${q}"。`);
        return;
      }
      console.log(`\n基准色：${base.name} (${base.hex})\n`);
      const harmonies = generateHarmony(base, hType);
      for (const [key, item] of Object.entries(harmonies)) {
        console.log(`\n━━━ ${item.name} ━━━`);
        console.log(`意象解析：${item.desc}`);
        console.log(item.colors.map(c => `  • ${c.name.padEnd(8, ' ')} ${c.hex}  RGB: [${c.RGB.join(', ')}]  五行: ${c.wuxing}`).join('\n'));
      }
      break;
    }

    case 'ui': {
      const q = args[1];
      const mode = args[2] || 'light';
      if (!q) {
        console.log('请提供颜色名称或 HEX，例如：node scripts/color_expert.js ui 天青 light');
        return;
      }
      const base = searchColors(q)[0];
      if (!base) {
        console.log(`未找到基准色 "${q}"。`);
        return;
      }
      const uiPlan = generateUiPalette(base, mode);
      console.log(`\n============================================================`);
      console.log(`【60-30-10 东方美学 UI 配色方案】 - 模式: ${mode.toUpperCase()}`);
      console.log(`主基调色：${base.name} (${base.hex}) - ${base.wuxing}`);
      console.log(`============================================================\n`);
      for (const [k, v] of Object.entries(uiPlan.ratio)) {
        console.log(`▸ ${v.role}:`);
        console.log(`  色名: ${v.color.name} (${v.color.hex}) | RGB: [${v.color.RGB.join(', ')}]`);
        console.log(`  设计职责: ${v.usage}\n`);
      }
      console.log(`无障碍与可读性指标 (WCAG 2.1)：`);
      console.log(`  • 主色对背景对比度: ${uiPlan.accessibility.primaryOnBgRatio}`);
      console.log(`  • 文本对背景对比度: ${uiPlan.accessibility.textOnBgRatio}`);
      console.log(`  • 强调色对背景对比度: ${uiPlan.accessibility.accentOnBgRatio}\n`);
      break;
    }

    case 'theme': {
      const t = args[1];
      if (!t) {
        console.log('请提供主题名称或关键词，例如：node scripts/color_expert.js theme 故宫');
        return;
      }
      const res = getThemePalette(t);
      if (!res) {
        console.log(`未找到匹配的主题 "${t}"。可运行 "node scripts/color_expert.js list-themes" 查看所有主题。`);
        return;
      }
      console.log(`\n============================================================`);
      console.log(`【经典国色主题谱】${res.name}`);
      console.log(`============================================================`);
      console.log(`美学意境：${res.concept}\n`);
      console.log(`推荐色谱阵容：`);
      res.palette.forEach(c => {
        console.log(`  • ${c.name.padEnd(8, ' ')} ${c.hex}  RGB:[${c.RGB.join(', ')}]  CMYK:[${c.CMYK.join(', ')}]  ${c.wuxing}`);
      });
      console.log('\n');
      break;
    }

    case 'list-themes': {
      console.log('\n内置经典国色主题谱系：\n');
      for (const [k, v] of Object.entries(classicThemes)) {
        console.log(`  • ${k.padEnd(10, ' ')}: ${v.name}`);
        console.log(`    意境：${v.concept}`);
        console.log(`    典型色：${v.colors.join('、')}\n`);
      }
      break;
    }

    case 'css': {
      const q = args[1];
      const mode = args[2] || 'light';
      if (!q) {
        console.log('请提供颜色名称或 HEX，例如：node scripts/color_expert.js css 霁蓝 light');
        return;
      }
      const base = searchColors(q)[0];
      if (!base) {
        console.log(`未找到基准色 "${q}"。`);
        return;
      }
      const uiPlan = generateUiPalette(base, mode);
      console.log(exportCssTokens(uiPlan));
      break;
    }

    default:
      console.log(`未知命令 "${cmd}"。输入 "node scripts/color_expert.js help" 查看帮助。`);
  }
}

// 导出模块方法供其他脚本调用
module.exports = {
  rawColors,
  colorDatabase,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  rgbToLab,
  deltaE,
  getContrastRatio,
  findClosestColor,
  searchColors,
  generateHarmony,
  generateUiPalette,
  classicThemes,
  getThemePalette,
  exportCssTokens
};

if (require.main === module) {
  main();
}
