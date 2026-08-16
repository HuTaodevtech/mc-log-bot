// ============================================================
// MC Log Bot — baca pesan log Minecraft (via webhook MC Linker)
// dari 1 channel Discord, simpan di memori, sediain API buat website.
// ============================================================

require("dotenv").config();
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const express = require("express");
const cors = require("cors");

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PORT = process.env.PORT || 3000;
const MAX_LOGS = 200; // simpan 200 log terakhir aja biar ringan

if (!BOT_TOKEN || !CHANNEL_ID) {
  console.error("❌ BOT_TOKEN atau CHANNEL_ID belum di-set di environment variable!");
  process.exit(1);
}

// ------------------------------------------------------------
// Penyimpanan log sementara (in-memory, reset kalau bot restart)
// ------------------------------------------------------------
let logs = [];

function pushLog(entry) {
  logs.push({ ...entry, timestamp: Date.now() });
  if (logs.length > MAX_LOGS) logs = logs.slice(logs.length - MAX_LOGS);
}

// ------------------------------------------------------------
// Parsing pesan dari webhook "MC Linker Chat"
// MC Linker biasanya kirim salah satu format berikut lewat webhook:
//   "<PlayerName> pesan chat"
//   "PlayerName joined the game"
//   "PlayerName left the game"
// Kalau format aslinya beda, sesuaikan regex di bawah ini.
// ------------------------------------------------------------
function parseMinecraftMessage(content) {
  if (!content) return null;
  let text = content.trim();

  // MC Linker sering mulai pesan dengan custom emoji Discord, contoh: <:join:123456789>
  // Kita ambil nama emoji-nya (join/leave/death/dst) lalu buang dari teks.
  const emojiMatch = text.match(/^<a?:([^:>]+):(\d+)>\s*/);
  let emojiName = null;
  if (emojiMatch) {
    emojiName = emojiMatch[1].toLowerCase();
    text = text.slice(emojiMatch[0].length).trim();
  }

  // Ambil nama player yang biasanya di-bold: **NamaPlayer**
  const boldMatch = text.match(/\*\*([^*]+)\*\*/);
  const player = boldMatch ? boldMatch[1] : null;
  const rest = boldMatch ? text.replace(boldMatch[0], "").trim() : text;

  // JOIN
  if (emojiName === "join" || /joined the game/i.test(rest)) {
    return { type: "join", player: player || rest.split(" ")[0], message: null };
  }

  // LEAVE
  if (emojiName === "leave" || /left the game/i.test(rest)) {
    return { type: "leave", player: player || rest.split(" ")[0], message: null };
  }

  // DEATH (kata kunci umum pesan kematian Minecraft)
  const deathKeywords = /died|slain|drowned|blew up|fell|burned|starved|shot|kinetic energy|suffocated|withered|froze|blast|lava|arrow|explosion/i;
  if (emojiName === "death" || (player && deathKeywords.test(rest))) {
    return { type: "death", player, message: rest };
  }

  // CHAT — kalau ada nama bold + sisa teks, anggap itu chat biasa
  if (player && rest) {
    return { type: "chat", player, message: rest };
  }

  // Fallback terakhir: coba tangkap "Nama > pesan" atau "Nama: pesan"
  const fallbackMatch = text.match(/([A-Za-z0-9_.]{3,16})\s*[:>]\s*(.+)$/);
  if (fallbackMatch) {
    return { type: "chat", player: fallbackMatch[1], message: fallbackMatch[2] };
  }

  return null; // pesan nggak dikenali, diabaikan
}

// ------------------------------------------------------------
// Bot Discord
// ------------------------------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once("ready", () => {
  console.log(`✅ Bot online sebagai ${client.user.tag}`);
  console.log(`👀 Mendengarkan channel ID: ${CHANNEL_ID}`);
});

client.on("messageCreate", (message) => {
  // hanya proses pesan dari channel yang ditentukan
  if (message.channel.id !== CHANNEL_ID) return;

  // Ambil isi pesan. Kalau MC Linker kirim lewat embed, cek embed juga.
  let content = message.content;
  if (!content && message.embeds?.length > 0) {
    const embed = message.embeds[0];
    content = embed.description || embed.title || "";
  }

  const parsed = parseMinecraftMessage(content);
  if (!parsed) return;

  console.log(`📩 [${parsed.type}] ${parsed.player}${parsed.message ? ": " + parsed.message : ""}`);
  pushLog(parsed);
});

client.login(BOT_TOKEN).catch((err) => {
  console.error("❌ Gagal login ke Discord, cek BOT_TOKEN kamu:", err.message);
  process.exit(1);
});

// ------------------------------------------------------------
// API buat website
// ------------------------------------------------------------
const app = express();
app.use(cors());

app.get("/api/logs", (req, res) => {
  res.json({ ok: true, count: logs.length, logs: [...logs].reverse() });
});

app.get("/", (req, res) => {
  res.send("MC Log Bot jalan. Endpoint log ada di /api/logs");
});

app.listen(PORT, () => {
  console.log(`🌐 API jalan di port ${PORT}`);
});
