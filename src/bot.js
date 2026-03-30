const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');

// 🔐 TOKEN
const TOKEN = process.env.LATIOS_TOKEN;

if (!TOKEN) {
  console.error("❌ Missing LATIOS_TOKEN");
  process.exit(1);
}

// 📊 CONFIG
const statsUrl = "https://gist.githubusercontent.com/WrPages/bb18eda2ea748723d8fe0131dd740b70/raw/elite_users.json";
const onlineUrl = "https://gist.githubusercontent.com/WrPages/d9db3a72fed74c496fd6cc830f9ca6e9/raw/elite_ids.txt";

const heartbeatChannelId = "1483616146996465735";
const panelChannelId = "1484015417411244082";

// 🤖 CLIENT
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

let panelMessage = null;

// 📥 FETCH
async function fetchJSON(url) {
  const res = await axios.get(url);
  return res.data;
}

async function fetchOnlineIDs(url) {
  const res = await axios.get(url);
  return res.data
    .split("\n")
    .map(id => id.trim())
    .filter(Boolean);
}

// 🧠 LIMPIAR LISTAS
function cleanList(str) {
  if (!str) return [];

  return str
    .split(",")
    .map(x => x.trim())
    .filter(x =>
      x &&
      x !== "-" &&
      x.toLowerCase() !== "none" &&
      x.toLowerCase() !== "null"
    );
}

// 🎨 FORMATO LISTAS
function formatList(arr) {
  if (!arr || arr.length === 0) return "-";
  return arr.join(" • ");
}

// 🧠 PARSE STATS
function parseStats(content) {
  const time = content.match(/Time:\s(.+?)\sPacks:/)?.[1] || "0";
  const packs = content.match(/Packs:\s(\d+)/)?.[1] || "0";
  const ppm = content.match(/Avg:\s([\d.]+)/)?.[1] || "0";

  const onlineRaw = content.match(/Online:\s(.+)/)?.[1];
  const offlineRaw = content.match(/Offline:\s(.+)/)?.[1];

  const online = cleanList(onlineRaw);
  const offline = cleanList(offlineRaw);

  return { time, packs, ppm, online, offline };
}

// 🔍 DETECTAR MENSAJE MÁS RECIENTE POR USUARIO
function findLastUserMessage(messages, username) {
  const name = username.toLowerCase();

  return messages.find(msg => {
    const c = msg.content.toLowerCase();
    return c.startsWith(name) || c.includes(`\n${name}`) || c.includes(name);
  });
}

// 📥 OBTENER MENSAJES DE LAS ÚLTIMAS 12 HORAS
async function fetchLastMessages(channel) {
  let all = [];
  let lastId = null;

  const now = Date.now();
  const limitTime = now - (12 * 60 * 60 * 1000); // 12h

  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const msgs = await channel.messages.fetch(options);
    if (!msgs.size) break;

    for (const msg of msgs.values()) {
      if (msg.createdTimestamp < limitTime) {
        return all; // ⛔ detenemos cuando pasamos las 12h
      }
      all.push(msg);
    }

    lastId = msgs.last().id;
  }
}

// 📊 GENERAR PANEL
async function generatePanel() {
  const users = await fetchJSON(statsUrl);
  const onlineIDs = await fetchOnlineIDs(onlineUrl);

  const channel = await client.channels.fetch(heartbeatChannelId);
  const messages = await fetchLastMessages(channel);

  let onlineList = [];
  let offlineList = [];

  for (const key in users) {
    const user = users[key];

    const isOnline =
      onlineIDs.includes(user.main_id) ||
      (user.sec_id && onlineIDs.includes(user.sec_id));

    const msg = findLastUserMessage(messages, user.name);

    if (msg) {
      const stats = parseStats(msg.content);

      if (isOnline) {
        // 🟢 ONLINE
        onlineList.push(
          `⚔️ **__${user.name}__**\n` +
          `⚡ **PPM:** ${stats.ppm} | 🧧 **Packs:** ${stats.packs} | ⏱ **Time:** ${stats.time}\n` +
          `🔥 ${formatList(stats.online)}\n` +
          `💤 ${formatList(stats.offline)}`
        );

      } else {
        // 💤 OFFLINE (COMPACTO)
        offlineList.push(
          `💤 **__${user.name}__** | 🧧 ${stats.packs} | ⏱ ${stats.time}`
        );
      }

    } else {
      const noData = `💤 **__${user.name}__** | No data`;

      isOnline ? onlineList.push(noData) : offlineList.push(noData);
    }
  }

  return new EmbedBuilder()
    .setTitle("General stats")
    .setColor(0x5865F2)
    .addFields(
      {
        name: `🟢 **ACTIVE USERS (${onlineList.length})**`,
        value: onlineList.join("\n\n") || "No active users"
      },
      {
        name: `🔴 **INACTIVE USERS (${offlineList.length})**`,
        value: offlineList.join("\n") || "No inactive users"
      }
    )
    .setTimestamp();
}

// 🚀 START
client.once('ready', async () => {
  console.log(`✅ Bot ready: ${client.user.tag}`);

  const panelChannel = await client.channels.fetch(panelChannelId);

  const embed = await generatePanel();
  panelMessage = await panelChannel.send({ embeds: [embed] });

  setInterval(async () => {
    try {
      const newEmbed = await generatePanel();
      await panelMessage.edit({ embeds: [newEmbed] });
    } catch (err) {
      console.error("❌ Update error:", err);
    }
  }, 300000); // 5 minutos
});

// 🔐 LOGIN
client.login(TOKEN);