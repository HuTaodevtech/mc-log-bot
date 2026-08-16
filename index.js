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

  // Format chat: <Nama> isi pesan
  const chatMatch = content.match(/^<([^>]+)>\s*(.+)$/);
  if (chatMatch) {
    return { type: "chat", player: chatMatch[1], message: chatMatch[2] };
  }

  // Format join
  const joinMatch = content.match(/^(\S+)\s+joined the game$/i);
  if (joinMatch) {
    return { type: "join", player: joinMatch[1], message: null };
  }

  // Format leave
  const leaveMatch = content.match(/^(\S+)\s+left the game$/i);
  if (leaveMatch) {
    return { type: "leave", player: leaveMatch[1], message: null };
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
