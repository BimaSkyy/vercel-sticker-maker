const fs = require("fs");
const os = require("os");
const path = require("path");
const axios = require("axios");
const ffmpegPath = require("ffmpeg-static");
const ffmpeg = require("fluent-ffmpeg");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

ffmpeg.setFfmpegPath(ffmpegPath);

// Font di-register manual langsung dari file TTF yang di-bundle di project.
// @napi-rs/canvas TIDAK butuh fontconfig OS (beda dari sharp+librsvg yang gagal
// di Vercel karena /etc/fonts/fonts.conf tidak ada). Ini yang bikin lebih reliable.
const FONT_PATH = path.join(__dirname, "..", "assets", "fonts", "DejaVuSans-Bold.ttf");
const FONT_FAMILY = "WelcomeFont";
GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);

/**
 * Generate animated WEBP welcome sticker.
 * @param {Object} opts
 * @param {string} opts.groupName
 * @param {string} [opts.botName]
 * @param {string} [opts.avatarUrl]
 * @returns {Promise<Buffer>} buffer webp animasi
 */
async function generateWelcomeSticker({ groupName, botName = "Alesya", avatarUrl = null }) {
  let tmpDir;
  try {
    let avatarImg = null;
    if (avatarUrl) {
      try {
        const r = await axios.get(avatarUrl, { responseType: "arraybuffer", timeout: 15000 });
        avatarImg = await loadImage(Buffer.from(r.data));
      } catch (e) {
        avatarImg = null;
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

    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const CX = 256;
    const RULE_Y = 228;
    const HEAD_FS = 68;
    const AV_R = 88;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    function roundRectPath(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    const drawBackground = () => {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, BG_TOP);
      grad.addColorStop(1, BG_BOT);
      ctx.save();
      roundRectPath(ctx, 0, 0, W, H, 72);
      ctx.clip();
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    };

    const drawWatermark = () => {
      ctx.save();
      ctx.font = `600 13px "${FONT_FAMILY}"`;
      ctx.fillStyle = SUB;
      ctx.globalAlpha = 0.7;
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(watermark, W - 26, H - 22);
      ctx.restore();
    };

    const drawAvatar = (cy, r, opacity = 1) => {
      ctx.save();
      ctx.globalAlpha = opacity;
      // shadow
      ctx.beginPath();
      ctx.arc(CX, cy + 8, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.filter = "blur(8px)";
      ctx.fill();
      ctx.filter = "none";

      // avatar / fallback circle
      ctx.beginPath();
      ctx.arc(CX, cy, r, 0, Math.PI * 2);
      ctx.closePath();
      if (avatarImg) {
        ctx.save();
        ctx.clip();
        ctx.drawImage(avatarImg, CX - r, cy - r, r * 2, r * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
      // ring
      ctx.beginPath();
      ctx.arc(CX, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 5;
      ctx.globalAlpha = opacity * 0.95;
      ctx.stroke();
      ctx.restore();
    };

    const drawAccentLine = (lw, opacity = 1) => {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = ACCENT;
      roundRectPath(ctx, CX - lw / 2, RULE_Y, lw, 3, 1.5);
      ctx.fill();
      ctx.restore();
    };

    // Canvas gak native support letter-spacing lewat ctx.font, jadi manual per-karakter
    function drawLetterSpaced(c, text, cx, y, spacing) {
      const widths = [...text].map((ch) => c.measureText(ch).width);
      const totalW = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
      let x = cx - totalW / 2;
      const prevAlign = c.textAlign;
      c.textAlign = "left";
      [...text].forEach((ch, i) => {
        c.fillText(ch, x, y);
        x += widths[i] + spacing;
      });
      c.textAlign = prevAlign;
    }

    const drawHeading = (text, y, opacity = 1) => {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.font = `800 ${HEAD_FS}px "${FONT_FAMILY}"`;
      ctx.fillStyle = INK;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      drawLetterSpaced(ctx, text, CX, y, 2);
      ctx.restore();
    };

    const drawNameLines = (lines, baseY, lineH, fontSize, opacity = 1, yOff = 0) => {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.font = `800 ${fontSize}px "${FONT_FAMILY}"`;
      ctx.fillStyle = INK;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      lines.forEach((ln, idx) => {
        drawLetterSpaced(ctx, ln, CX, baseY + idx * lineH + yOff, 0.5);
      });
      ctx.restore();
    };

    const drawSideRules = (half, lw, y) => {
      ctx.save();
      ctx.fillStyle = LINE;
      roundRectPath(ctx, CX - half - lw, y, lw, 2, 1);
      ctx.fill();
      roundRectPath(ctx, CX + half, y, lw, 2, 1);
      ctx.fill();
      ctx.restore();
    };

    const drawPill = (bw, bh, y, textOpacity = 1) => {
      ctx.save();
      const bx = CX - bw / 2;
      const by = y - bh / 2;
      ctx.fillStyle = ACCENT;
      ctx.globalAlpha = 0.10;
      roundRectPath(ctx, bx, by, bw, bh, bh / 2);
      ctx.fill();
      ctx.globalAlpha = textOpacity;
      ctx.font = `800 16px "${FONT_FAMILY}"`;
      ctx.fillStyle = ACCENT;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      drawLetterSpaced(ctx, botShown, CX, by + bh / 2 + 6, 3);
      ctx.restore();
    };

    const frames = [];
    const captureFrame = () => {
      frames.push(canvas.toBuffer("image/png"));
    };
    const newFrame = () => {
      ctx.clearRect(0, 0, W, H);
      drawBackground();
    };

    // FASE 1: garis aksen + WELCOME
    for (let i = 0; i < 12; i++) {
      const t = easeOut(i / 11);
      newFrame();
      drawAccentLine(120 * t);
      drawHeading("WELCOME", 200 + (1 - t) * 10, t);
      drawWatermark();
      captureFrame();
    }

    // FASE 2: TO..
    for (let i = 0; i < 10; i++) {
      const t = easeOut(i / 9);
      newFrame();
      drawAccentLine(120);
      drawHeading("WELCOME", 200, 1);
      drawHeading("TO..", 320 + (1 - t) * 14, t);
      drawWatermark();
      captureFrame();
    }

    // FASE 3: teks fade + avatar slide dari bawah
    for (let i = 0; i < 14; i++) {
      const t = easeInOut(i / 13);
      const textOp = Math.max(0, 1 - t * 1.6);
      const cy = (H + 80) - (H + 80 - H / 2) * t;
      newFrame();
      drawAccentLine(120, textOp);
      drawHeading("WELCOME", 200, textOp);
      drawHeading("TO..", 320, textOp);
      drawAvatar(cy, AV_R);
      drawWatermark();
      captureFrame();
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

      newFrame();
      drawAvatar(cy, AV_R);
      const lwR = RULE_SIDE_W * tName;
      drawSideRules(half, lwR, nameRuleY + yOff);
      drawNameLines(shownLines, nameBaseY, lineH, NAME_FS, nameOp, yOff);
      drawWatermark();
      captureFrame();
    }

    // FASE 5: pill nama bot
    const PILL_W = 210, PILL_H = 44;
    const blockBottom = nameBaseY + (shownLines.length - 1) * lineH;
    const PILL_Y = Math.min(blockBottom + 46, H - 46);

    for (let i = 0; i < 12; i++) {
      const t = easeOut(i / 11);
      const bw = PILL_W * t;
      const bh = PILL_H * t;
      const pillTxtOp = Math.max(0, (t - 0.4) / 0.6);

      newFrame();
      drawAvatar(avUpY, AV_R);
      drawSideRules(half, RULE_SIDE_W, nameRuleY);
      drawNameLines(shownLines, nameBaseY, lineH, NAME_FS, 1, 0);
      drawPill(bw, bh, PILL_Y, pillTxtOp);
      drawWatermark();
      captureFrame();
    }

    // HOLD 2 detik
    newFrame();
    drawAvatar(avUpY, AV_R);
    drawSideRules(half, RULE_SIDE_W, nameRuleY);
    drawNameLines(shownLines, nameBaseY, lineH, NAME_FS, 1, 0);
    drawPill(PILL_W, PILL_H, PILL_Y, 1);
    drawWatermark();
    const holdPng = canvas.toBuffer("image/png");
    for (let i = 0; i < FPS * 2; i++) frames.push(holdPng);

    // ===== render ke webp pakai ffmpeg-static =====
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
