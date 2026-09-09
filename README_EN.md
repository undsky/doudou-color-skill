# Chinese Traditional Color Palette Skill (doudou-color)

<p align="center">
  <a href="README.md">简体中文</a> | <b>English</b>
</p>

<p align="center">
  <img src="./assets/banner.png" alt="Chinese Traditional Color Palette Skill Banner" width="100%" />
</p>

> **A Professional Color Expert Skill Built on 526 Authentic Chinese Traditional Colors**
> 
> Fuses Eastern Five Elements (Wu Xing) color philosophy with modern color harmony theory, delivering expert color schemes for digital UI/UX, brand packaging, print design, and visual posters.

---

## 📑 Table of Contents

- [📖 User Guide](#-user-guide)
  - [1. Installation](#1-installation)
  - [2. Usage](#2-usage)
- [🌟 Key Features](#-key-features)
- [💬 Community & Support](#-community--support)

---

## 📖 User Guide

This skill functions as a **specialized color intelligence engine for AI Agents** (compatible with Antigravity, Claude Code, OpenCode, and more).

---

### 1. Installation

Install effortlessly into any target project root via the command line:

```bash
npx skills add undsky/doudou-color-skill --yes
```

---

### 2. Usage

No professional color jargon required—simply describe what you want to create and the mood you are looking for in natural language:

#### Scenario 1: Aesthetic & Vibrant Visuals / Bold Color Blocking

> _"I want to design a set of gorgeous, vibrant visual posters using high-contrast color blocking for maximum visual impact. Help me build a stunning and sophisticated set of Chinese traditional contrasting colors!"_

![demo1](./demo/demo1.png)

[View Live DEMO](https://htmlpreview.github.io/?https://github.com/undsky/doudou-color-skill/blob/master/demo/demo1.html)

#### Scenario 2: Complementing a Given Color with Chinese Aesthetics

> _"I like this blue color #1976D2. Can you help me pair it with a few complementary traditional Chinese colors?"_

![demo2](./demo/demo2.png)

[View Live DEMO](https://htmlpreview.github.io/?https://github.com/undsky/doudou-color-skill/blob/master/demo/demo2.html)

#### Scenario 3: Fresh, Natural & Healing / Light & Airy Cultural Creative Packaging

> _"I want to design packaging for cultural & creative products that feels fresh, airy, and soothing, with a breathable and translucent vibe. Please recommend a palette of clean, luminous Chinese traditional colors!"_

![demo3](./demo/demo3.png)

[View Live DEMO](https://htmlpreview.github.io/?https://github.com/undsky/doudou-color-skill/blob/master/demo/demo3.html)

---

## 🌟 Key Features

1. **Authoritative Color Dataset**:
   - Built-in database of 526 classic Chinese traditional colors (`colors.json`), featuring poetic Chinese names, Pinyin, HEX values, screen RGB values, and four-color CMYK print specs.
2. **Scientific & Perceptual Color Matching**:
   - Precision color matching using **RGB -> XYZ -> CIE LAB** color space conversion and **Delta-E (CIE76)** minimum color difference calculation to map any modern HEX color to its closest authentic Chinese traditional counterpart.
   - Built-in synonym mapping for traditional cultural color names (e.g., Tianqing / Skylight Blue, Xuanqing / Deep Black, Zhusha / Cinnabar Red, Zhuqing / Bamboo Green, Jilan / Sacrificial Blue).
3. **Eastern Aesthetics & Modern Harmony Theory**:
   - Full support for standard harmonic calculations: Complementary, Analogous, Triadic, Split-Complementary, and Monochromatic shades.
   - Infused with the Five Elements (Wu Xing) generative & destructive cycles (Wood/Cyan-Green, Fire/Red, Earth/Yellow, Metal/White, Water/Black) and traditional artifact glazes (Ru ware sky blue, Xuande furnace bronze, Qianli Jiangshan blue-green landscape, Forbidden City vermilion & imperial gold).
4. **Digital UI/UX Engineering Ready**:
   - Automatically generates modern interface palettes adhering to the **60-30-10 Golden Rule** (background base, card surfaces, brand primary, secondary, accent, body text, and muted text).
   - Built-in **WCAG 2.1 AA/AAA accessibility contrast ratio validation**.
   - One-click export for Light and Dark mode CSS Design Tokens.

---

## 💬 Community & Support

| WeChat Official Account                      | QQ Community Group                            |
| -------------------------------------------- | --------------------------------------------- |
| ![Official Account](https://cdn.undsky.com/img/gh.jpg) | ![QQ Group](https://cdn.undsky.com/img/qqqun.jpg) |
