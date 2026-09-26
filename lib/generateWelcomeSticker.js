const fs = require("fs");
const os = require("os");
const path = require("path");
const axios = require("axios");
const sharp = require("sharp");
const ffmpegPath = require("ffmpeg-static");
const ffmpeg = require("fluent-ffmpeg");

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Generate animated WEBP welcome sticker.
 * @param {Object} opts
 * @param {string} opts.groupName - nama grup / judul yang ditampilkan
 * @param {string} [opts.botName] - nama bot untuk watermark & pill
 * @param {string} [opts.avatarUrl] - URL foto profil (opsional)
 * @returns {Promise<Buffer>} buffer webp animasi
 */
async function generateWelcomeSticker({ groupName, botName = "Alesya", avatarUrl = null }) {
  let tmpDir;
  try {
    let avatarBuf = null;
    if (avatarUrl) {
      try {
        const r = await axios.get(avatarUrl, { responseType: "arraybuffer", timeout: 15000 });
        avatarBuf = Buffer.from(r.data);
      } catch (e) {
        avatarBuf = null;
      }
    }

    const W = 512, H = 512, FPS = 15;
    const BG_TOP = "#fdfcf7";
    const BG_BOT = "#eef1f5";
    const INK = "#1a2230";
    const SUB = "#6b7484";
    const LINE = "#c9d1dd";
    const ACCENT = "#2f6bff";

    const nameRaw = (groupName || botName).replace(/[<>&'"]/g, "").replace(/\s+/g, " ").trim();
    const botShown = (botName || "Alesya").replace(/[<>&'"]/g, "").trim();
    const watermark = botShown;
    const FONT = "Helvetica,Arial,sans-serif";

    // ===== word-wrap: max 10 karakter per baris =====
    const CHAR_PER_LINE = 10;
    const wrapName = (str) => {
      const words = str.split(" ").filter(Boolean);
      const lines = [];
      let cur = "";
      const pushChunked = (w) => {
        for (let i = 0; i < w.length; i += CHAR_PER_LINE) {
          const chunk = w.slice(i, i + CHAR_PER_LINE);
          if (chunk.length === CHAR_PER_LINE) lines.push(chunk);
          else cur = chunk;
        }
      };
      for (const w of words) {
        if (!cur) {
          if (w.length <= CHAR_PER_LINE) { cur = w; }
          else { pushChunked(w); }
          continue;
        }
        const candidate = cur + " " + w;
        if (candidate.length <= CHAR_PER_LINE) { cur = candidate; }
        else {
          lines.push(cur);
          cur = "";
          if (w.length <= CHAR_PER_LINE) cur = w;
          else pushChunked(w);
        }
      }
      if (cur) lines.push(cur);
      return lines;
    };
    const nameLines = wrapName(nameRaw);

    const maxLines = 6;
    const shownLines = nameLines.slice(0, maxLines);
    let NAME_FS = 40;
    if (shownLines.length === 2) NAME_FS = 40;
    else if (shownLines.length === 3) NAME_FS = 36;
    else if (shownLines.length === 4) NAME_FS = 30;
    else if (shownLines.length >= 5) NAME_FS = 26;

    const render = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

    const avCircle = avatarBuf
      ? await sharp(avatarBuf).resize(240, 240, { fit: "cover" }).png().toBuffer()
      : null;
    const avB64 = avCircle ? `data:image/png;base64,${avCircle.toString("base64")}` : "";

    const defs = `
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${BG_TOP}"/>
          <stop offset="100%" stop-color="${BG_BOT}"/>
        </linearGradient>
        <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" result="b"/>
          <feColorMatrix in="b" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.20 0"/>
        </filter>
      </defs>`;

    const wm = `<text x="${W - 26}" y="${H - 22}" font-family="${FONT}" font-size="13" font-weight="600" fill="${SUB}" fill-opacity="0.7" text-anchor="end">${watermark}</text>`;
    const wrap = (inner) => `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${defs}<rect width="${W}" height="${H}" rx="72" fill="url(#bg)"/>${inner}${wm}</svg>`;
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const frames = [];
    const push = (svg) => render(svg).then((b) => frames.push(b));

    let uid = 0;
    const avTag = (cy, r) => {
      const id = "ac" + (uid++);
      if (avB64) {
        return `<clipPath id="${id}"><circle cx="256" cy="${cy.toFixed(1)}" r="${r}"/></clipPath>` +
               `<image x="${256 - r}" y="${(cy - r).toFixed(1)}" width="${r * 2}" height="${r * 2}" clip-path="url(#${id})" href="${avB64}"/>` +
               `<circle cx="256" cy="${cy.toFixed(1)}" r="${r}" fill="none" stroke="#ffffff" stroke-width="5" stroke-opacity="0.95"/>`;
      }
      return `<circle cx="256" cy="${cy.toFixed(1)}" r="${r}" fill="#fff"/>`;
    };
    const shadowTag = (cy, r) => `<circle cx="256" cy="${(cy + 8).toFixed(1)}" r="${r}" fill="#000" fill-opacity="0.28" filter="url(#soft)"/>`;

    const CX = 256;
    const RULE_Y = 228;
    const HEAD_FS = 68;
    const AV_R = 88;

    // FASE 1: garis aksen + WELCOME
    for (let i = 0; i < 12; i++) {
      const t = easeOut(i / 11);
      const lw = 120 * t;
      const yUp = 200 + (1 - t) * 10;
      const line = `<rect x="${CX - lw/2}" y="${RULE_Y}" width="${lw.toFixed(1)}" height="3" rx="1.5" fill="${ACCENT}"/>`;
      const w1 = `<text x="${CX}" y="${yUp.toFixed(1)}" font-family="${FONT}" font-size="${HEAD_FS}" font-weight="800" letter-spacing="2" fill="${INK}" fill-opacity="${t.toFixed(2)}" text-anchor="middle">WELCOME</text>`;
      await push(wrap(line + w1));
    }

    // FASE 2: TO..
    for (let i = 0; i < 10; i++) {
      const t = easeOut(i / 9);
      const lw = 120;
      const line = `<rect x="${CX - lw/2}" y="${RULE_Y}" width="${lw}" height="3" rx="1.5" fill="${ACCENT}"/>`;
      const w1 = `<text x="${CX}" y="200" font-family="${FONT}" font-size="${HEAD_FS}" font-weight="800" letter-spacing="2" fill="${INK}" text-anchor="middle">WELCOME</text>`;
      const y2 = 320 + (1 - t) * 14;
      const w2 = `<text x="${CX}" y="${y2.toFixed(1)}" font-family="${FONT}" font-size="${HEAD_FS}" font-weight="800" letter-spacing="2" fill="${INK}" fill-opacity="${t.toFixed(2)}" text-anchor="middle">TO..</text>`;
      await push(wrap(line + w1 + w2));
    }

    // FASE 3: teks fade + avatar slide dari bawah
    for (let i = 0; i < 14; i++) {
      const t = easeInOut(i / 13);
      const textOp = Math.max(0, 1 - t * 1.6);
      const cy = (H + 80) - (H + 80 - H/2) * t;
      const lw = 120;
      const line = `<rect x="${CX - lw/2}" y="${RULE_Y}" width="${lw}" height="3" rx="1.5" fill="${ACCENT}" fill-opacity="${textOp.toFixed(2)}"/>`;
      const w1 = `<text x="${CX}" y="200" font-family="${FONT}" font-size="${HEAD_FS}" font-weight="800" letter-spacing="2" fill="${INK}" fill-opacity="${textOp.toFixed(2)}" text-anchor="middle">WELCOME</text>`;
      const w2 = `<text x="${CX}" y="320" font-family="${FONT}" font-size="${HEAD_FS}" font-weight="800" letter-spacing="2" fill="${INK}" fill-opacity="${textOp.toFixed(2)}" text-anchor="middle">TO..</text>`;
      await push(wrap(line + w1 + w2 + shadowTag(cy, AV_R) + avTag(cy, AV_R)));
    }

    // FASE 4: avatar naik, nama muncul
    const avUpY = 150;
    const RULE_SIDE_W = 60;
    const RULE_GAP = 20;
    const lineH = NAME_FS * 1.15;
    const nameBlockTop = avUpY + AV_R + 40;
    const blockH = shownLines.length * lineH;
    const pillSpace = 70;
    const availableBottom = H - pillSpace;
    const blockCenter = (nameBlockTop + availableBottom) / 2;
    const nameBaseY = blockCenter - blockH / 2 + NAME_FS * 0.85;
    const nameRuleY = nameBaseY - NAME_FS * 0.32;
    const approxChar = NAME_FS * 0.6;
    const longestLine = shownLines.reduce((a, b) => (a.length > b.length ? a : b), "");
    const estTextW = Math.min(longestLine.length * approxChar, 400);
    const half = estTextW / 2 + RULE_GAP;

    for (let i = 0; i < 16; i++) {
      const t = easeInOut(i / 15);
      const cy = (H / 2) - (H / 2 - avUpY) * t;
      const tName = Math.max(0, (t - 0.35) / 0.65);
      const nameOp = Math.min(1, tName * 1.4);
      const yOff = (1 - tName) * 20;

      let nm = "";
      shownLines.forEach((ln, idx) => {
        const yy = (nameBaseY + idx * lineH) + yOff;
        nm += `<text x="${CX}" y="${yy.toFixed(1)}" font-family="${FONT}" font-size="${NAME_FS}" font-weight="800" letter-spacing="0.5" fill="${INK}" fill-opacity="${nameOp.toFixed(2)}" text-anchor="middle">${ln}</text>`;
      });
      const lwR = RULE_SIDE_W * tName;
      const ruleY = nameRuleY + yOff;
      const rules = `<rect x="${(CX - half - lwR).toFixed(1)}" y="${ruleY.toFixed(1)}" width="${lwR.toFixed(1)}" height="2" rx="1" fill="${LINE}"/>` +
                    `<rect x="${(CX + half).toFixed(1)}" y="${ruleY.toFixed(1)}" width="${lwR.toFixed(1)}" height="2" rx="1" fill="${LINE}"/>`;
      await push(wrap(shadowTag(cy, AV_R) + avTag(cy, AV_R) + rules + nm));
    }

    // FASE 5: pill nama bot
    const PILL_W = 210, PILL_H = 44;
    const blockBottom = nameBaseY + (shownLines.length - 1) * lineH;
    const PILL_Y = Math.min(blockBottom + 46, H - 46);

    const finalNameLines = shownLines.map((ln, idx) =>
      `<text x="${CX}" y="${(nameBaseY + idx * lineH).toFixed(1)}" font-family="${FONT}" font-size="${NAME_FS}" font-weight="800" letter-spacing="0.5" fill="${INK}" text-anchor="middle">${ln}</text>`
    ).join("");
    const finalRules = `<rect x="${(CX - half - RULE_SIDE_W).toFixed(1)}" y="${nameRuleY.toFixed(1)}" width="${RULE_SIDE_W}" height="2" rx="1" fill="${LINE}"/>` +
                       `<rect x="${(CX + half).toFixed(1)}" y="${nameRuleY.toFixed(1)}" width="${RULE_SIDE_W}" height="2" rx="1" fill="${LINE}"/>`;

    for (let i = 0; i < 12; i++) {
      const t = easeOut(i / 11);
      const bw = PILL_W * t;
      const bh = PILL_H * t;
      const bx = CX - bw / 2;
      const by = PILL_Y - bh / 2;
      const pill = `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="${(bh/2).toFixed(1)}" fill="${ACCENT}" fill-opacity="0.10"/>`;
      const pillTxtOp = Math.max(0, (t - 0.4) / 0.6);
      const pillTxt = `<text x="${CX}" y="${(by + bh/2 + 6).toFixed(1)}" font-family="${FONT}" font-size="16" font-weight="800" letter-spacing="3" fill="${ACCENT}" fill-opacity="${pillTxtOp.toFixed(2)}" text-anchor="middle">${botShown}</text>`;
      await push(wrap(shadowTag(avUpY, AV_R) + avTag(avUpY, AV_R) + finalRules + finalNameLines + pill + pillTxt));
    }

    // HOLD 2 detik
    const pillFinal = `<rect x="${(CX - PILL_W/2).toFixed(1)}" y="${(PILL_Y - PILL_H/2).toFixed(1)}" width="${PILL_W}" height="${PILL_H}" rx="${(PILL_H/2).toFixed(1)}" fill="${ACCENT}" fill-opacity="0.10"/>`;
    const pillTxtFinal = `<text x="${CX}" y="${(PILL_Y + 6).toFixed(1)}" font-family="${FONT}" font-size="16" font-weight="800" letter-spacing="3" fill="${ACCENT}" text-anchor="middle">${botShown}</text>`;
    const holdFrame = wrap(shadowTag(avUpY, AV_R) + avTag(avUpY, AV_R) + finalRules + finalNameLines + pillFinal + pillTxtFinal);
    const holdPng = await render(holdFrame);
    for (let i = 0; i < FPS * 2; i++) frames.push(holdPng);

    // ===== render ke webp pakai ffmpeg-static (works di Vercel /tmp) =====
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wlc_"));
    frames.forEach((buf, i) => fs.writeFileSync(path.join(tmpDir, `f${String(i).padStart(3, "0")}.png`), buf));

    const outWebp = path.join(tmpDir, "out.webp");

    await new Promise((resolve, reject) => {
      ffmpeg(path.join(tmpDir, "f%03d.png"))
        .inputFPS(FPS)
        .outputOptions([
          "-vf", "scale=512:512:flags=lanczos",
          "-loop", "0",
          "-c:v", "libwebp",
          "-lossless", "0",
          "-q:v", "82",
        ])
        .output(outWebp)
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    return fs.readFileSync(outWebp);
  } finally {
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    }
  }
}

module.exports = { generateWelcomeSticker };
