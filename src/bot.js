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
  return res.data.split("\n").map(x => x.trim()).filter(Boolean);
}

// 🧠 LIMPIAR LISTAS
function cleanList(str) {
  if (!str) return [];

  return str.split(",")
    .map(x => x.trim())
    .filter(x =>
      x &&
      x !== "-" &&
      x.toLowerCase() !== "none" &&
      x.toLowerCase() !== "null"
    );
}

// 🎨 FORMATO
function formatList(arr) {
  if (!arr.length) return "-";
  return arr.join(" • ");
}

// 🧠 PARSE
function parseStats(content) {
  const time = content.match(/Time:\s(.+?)\sPacks:/)?.[1] || "0";
  const packs = content.match(/Packs:\s(\d+)/)?.[1] || "0";
  const ppm = content.match(/Avg:\s([\d.]+)/)?.[1] || "0";

  const online = cleanList(content.match(/Online:\s(.+)/)?.[1]);
  const offline = cleanList(content.match(/Offline:\s(.+)/)?.[1]);

  return { time, packs, ppm, online, offline };
}

// 🔍 DETECCIÓN
function findLastUserMessage(messages, username) {
  const name = username.toLowerCase();

  return messages.find(msg => {
    const c = msg.content.toLowerCase();
    return c.startsWith(name) || c.includes(name);
  });
}

// ⏱ FETCH POR HORAS
async function fetchMessagesByHours(channel, hours) {
  let all = [];
  let lastId = null;

  const limitTime = Date.now() - (hours * 60 * 60 * 1000);

  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const msgs = await channel.messages.fetch(options);
    if (!msgs.size) break;

    for (const msg of msgs.values()) {
      if (msg.createdTimestamp < limitTime) return all;
      all.push(msg);
    }

    lastId = msgs.last().id;
  }
}

// 📊 GLOBAL STATS
function calculateGlobalStats(onlineStats, messages24h) {
  let totalPPM = 0;
  let totalInstances = 0;
  let totalPacks = 0;

  for (const s of onlineStats) {
    totalPPM += Number(s.ppm);

    const filtered = s.online.filter(x => x !== "1");
    totalInstances += filtered.length;
  }

  // 🎴 packs en 24h
  for (const msg of messages24h) {
    const packs = msg.content.match(/Packs:\s(\d+)/)?.[1];
    if (packs) totalPacks += Number(packs);
  }

  const activeUsers = onlineStats.length;

  const rate = 0.0005;
  const expectedPacks = 1 / rate;
  const minutesToGP = totalPPM > 0 ? expectedPacks / totalPPM : 0;

  return {
    totalPPM: totalPPM.toFixed(2),
    totalInstances,
    totalPacks,
    activeUsers,
    minutesToGP: minutesToGP.toFixed(1)
  };
}

// 📊 PANEL
async function generatePanel() {
  const users = await fetchJSON(statsUrl);
  const onlineIDs = await fetchOnlineIDs(onlineUrl);

  const channel = await client.channels.fetch(heartbeatChannelId);

  const messages12h = await fetchMessagesByHours(channel, 12);
  const messages24h = await fetchMessagesByHours(channel, 24);

  let onlineList = [];
  let offlineList = [];
  let onlineStats = [];

  for (const key in users) {
    const user = users[key];

    const isOnline =
      onlineIDs.includes(user.main_id) ||
      (user.sec_id && onlineIDs.includes(user.sec_id));

    const msg = findLastUserMessage(messages12h, user.name);

    if (msg) {
      const stats = parseStats(msg.content);

      if (isOnline) {
        onlineStats.push(stats);

        onlineList.push(
          `⚔️ **__${user.name}__**\n` +
          `⚡ **PPM:** ${stats.ppm} | 🎴 ${stats.packs} | ⏱ ${stats.time}\n` +
          `🔥 ${formatList(stats.online)}\n` +
          `💤 ${formatList(stats.offline)}`
        );

      } else {
        offlineList.push(
          `💤 **__${user.name}__** | 🎴 ${stats.packs} | ⏱ ${stats.time}`
        );
      }

    } else {
      const noData = `💤 **__${user.name}__** | No data`;
      isOnline ? onlineList.push(noData) : offlineList.push(noData);
    }
  }

  const global = calculateGlobalStats(onlineStats, messages24h);

  return [
    new EmbedBuilder()
      .setTitle("🐉 Dragon Reroll Dashboard")
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
      .setTimestamp(),

    new EmbedBuilder()
      .setTitle("📊 Global Reroll Stats")
      .setColor(0xF1C40F)
      .setDescription(
        `🔥 **⚡ TOTAL PPM: ${global.totalPPM} ⚡**\n\n` + // 👈 MÁS GRANDE / DESTACADO

        `🎴 Packs (24h): ${global.totalPacks}\n` +
        `🔥 Active Instances: ${global.totalInstances}\n` +
        `👥 Active Rerollers: ${global.activeUsers}\n\n` +

        `🎯 **GP Prediction**\n` +
        `≈ ${global.minutesToGP} min / GP`
      )
      .setTimestamp()
  ];
}

// 🚀 START
client.once('ready', async () => {
  console.log(`✅ Bot ready: ${client.user.tag}`);

  const panelChannel = await client.channels.fetch(panelChannelId);

  const embeds = await generatePanel();
  panelMessage = await panelChannel.send({ embeds });

  setInterval(async () => {
    try {
      const newEmbeds = await generatePanel();
      await panelMessage.edit({ embeds: newEmbeds });
    } catch (err) {
      console.error("❌ Update error:", err);
    }
  }, 300000);
});

// 🔐 LOGIN
client.login(TOKEN);