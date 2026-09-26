const { generateWelcomeSticker } = require("../lib/generateWelcomeSticker");

// Ganti dengan secret-mu sendiri, taruh di Vercel > Settings > Environment Variables
const API_KEY = process.env.STICKER_API_KEY;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed, gunakan POST" });
    return;
  }

  // Proteksi sederhana pakai API key, biar endpoint gak dipakai sembarangan orang
  if (API_KEY) {
    const key = req.headers["x-api-key"];
    if (key !== API_KEY) {
      res.status(401).json({ ok: false, error: "Unauthorized: x-api-key salah/kosong" });
      return;
    }
  }

  try {
    const { groupName, botName, avatarUrl } = req.body || {};

    if (!groupName) {
      res.status(400).json({ ok: false, error: "Field 'groupName' wajib diisi" });
      return;
    }

    const webpBuffer = await generateWelcomeSticker({ groupName, botName, avatarUrl });

    // Return langsung binary webp (bot WA tinggal fetch & pakai buffer ini)
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(webpBuffer);
  } catch (err) {
    console.error("[generate-sticker] error:", err);
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
};
