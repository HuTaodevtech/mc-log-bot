// ============================================================
// MC Log Bot — baca log Minecraft (via DiscordSRV) dari 1 atau
// banyak channel Discord (boleh beda server), simpan di memori,
// sediain API buat website.
// ============================================================

require("dotenv").config();
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const express = require("express");
const cors = require("cors");

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const MAX_LOGS = 200; // jumlah log terakhir yang disimpan

// Bisa 1 atau banyak channel, pisahkan dengan koma.
// Contoh: CHANNEL_IDS=111111111111111111,222222222222222222
// (CHANNEL_ID lama tetap didukung)
const CHANNEL_IDS = (process.env.CHANNEL_IDS || process.env.CHANNEL_ID || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

if (!BOT_TOKEN || CHANNEL_IDS.length === 0) {
  console.error("❌ BOT_TOKEN atau CHANNEL_IDS belum di-set di environment variable!");
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
// Parsing pesan DiscordSRV
// ------------------------------------------------------------

// Buang prefix "Guest " dari nama (hapus .replace kalau mau tetap ada)
function cleanName(name) {
  return (name || "").replace(/^Guest\s+/i, "").trim();
}

// Parsing teks event dari embed DiscordSRV (join/leave/death/advancement)
function parseEventText(raw) {
  const text = (raw || "").replace(/\*/g, "").trim();
  if (!text) return null;
  let m;

  if ((m = text.match(/^(.+?) joined the server$/i))) {
    return { type: "join", player: cleanName(m[1]), message: null };
  }
  if ((m = text.match(/^(.+?) left the server$/i))) {
    return { type: "leave", player: cleanName(m[1]), message: null };
  }
  if ((m = text.match(/^(.+?) has (?:made the advancement|completed the challenge|reached the goal)/i))) {
    return { type: "advancement", player: cleanName(m[1]), message: text };
  }

  const deathKeywords =
    /died|was |slain|drowned|blew up|fell|burned|starved|shot|suffocated|withered|froze|blast|lava|explosion|squashed|cactus|flames|hit the ground|walked into|tried to swim/i;
  if (deathKeywords.test(text)) {
    const first = text.match(/^(\S+)/);
    return { type: "death", player: cleanName(first ? first[1] : null), message: text };
  }

  return null; // event lain (server start/stop, dll) diabaikan
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
  console.log(`👀 Mendengarkan ${CHANNEL_IDS.length} channel: ${CHANNEL_IDS.join(", ")}`);
});

client.on("messageCreate", (message) => {
  if (!CHANNEL_IDS.includes(message.channel.id)) return;
  if (message.author.id === client.user.id) return; // abaikan bot sendiri

  let parsed = null;
  const embed = message.embeds?.[0];

  if (embed) {
    // DiscordSRV: join/leave/death/advancement berupa embed
    const text = embed.author?.name || embed.title || embed.description || "";
    parsed = parseEventText(text);
  } else if (message.webhookId) {
    // Chat dari Minecraft lewat webhook, username = nama player
    const text = message.content?.trim();
    if (text) {
      parsed = { type: "chat", player: cleanName(message.author.username), message: text };
    }
  } else if (!message.author.bot) {
    // Member Discord yang ngetik langsung (diteruskan ke Minecraft)
    const text = message.content?.trim();
    if (text) {
      parsed = {
        type: "chat",
        player: message.member?.displayName || message.author.username,
        message: text,
      };
    }
  }

  if (!parsed) return;

  const entry = {
    ...parsed,
    guildId: message.guild?.id || null,
    guildName: message.guild?.name || null,
    channelId: message.channel.id,
  };

  console.log(
    `📩 [${entry.guildName}] [${entry.type}] ${entry.player}${entry.message ? ": " + entry.message : ""}`
  );
  pushLog(entry);
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

// Semua log:            /api/logs
// Filter per server:    /api/logs?guild=GUILD_ID
// Filter per channel:   /api/logs?channel=CHANNEL_ID
app.get("/api/logs", (req, res) => {
  let result = [...logs].reverse();
  if (req.query.guild) result = result.filter((l) => l.guildId === req.query.guild);
  if (req.query.channel) result = result.filter((l) => l.channelId === req.query.channel);
  res.json({ ok: true, count: result.length, logs: result });
});

app.get("/", (req, res) => {
  res.send("MC Log Bot jalan. Endpoint log ada di /api/logs");
});

app.listen(PORT, () => {
  console.log(`🌐 API jalan di port ${PORT}`);
});
