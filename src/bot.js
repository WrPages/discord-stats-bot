const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');

// 🔐 TOKENS
const TOKEN = process.env.LATIOS_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN || !GITHUB_TOKEN) {
  console.error("❌ Missing tokens");
  process.exit(1);
}

// 📊 CONFIG
const statsUrl = "https://gist.githubusercontent.com/WrPages/bb18eda2ea748723d8fe0131dd740b70/raw/elite_users.json";
const onlineUrl = "https://gist.githubusercontent.com/WrPages/d9db3a72fed74c496fd6cc830f9ca6e9/raw/elite_ids.txt";

const ppmGistId = "fb7dd70fceaa1743943e67176352ffbd";
const ppmFileName = "ppm.json";

const heartbeatChannelId = "1483616146996465735";
const panelChannelId = "1484015417411244082";

// 🤖 CLIENT
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

let panelMessage = null;
let lastTotalPPM = 0;
let cachedAvgPPM = "0.00"; // 🔥 NUEVO

// 📥 FETCH
async function fetchJSON(url) {
  const res = await axios.get(url);
  return res.data;
}

async function fetchOnlineIDs(url) {
  const res = await axios.get(url);
  return res.data.split("\n").map(x => x.trim()).filter(Boolean);
}

// 🧠 GIST READ
async function getPPMHistory() {
  try {
    const res = await axios.get(`https://api.github.com/gists/${ppmGistId}`);
    const file = res.data.files[ppmFileName];

    if (!file || !file.content) return { history: [] };

    const parsed = JSON.parse(file.content);
    if (!parsed.history || !Array.isArray(parsed.history)) {
      return { history: [] };
    }

    return parsed;
  } catch {
    return { history: [] };
  }
}

// 💾 GUARDAR PPM
async function storePPM(value) {
  const data = await getPPMHistory();

  data.history.push({
    timestamp: Date.now(),
    ppm: Number(value)
  });

  if (data.history.length > 24) {
    data.history = data.history.slice(-24);
  }

  await axios.patch(
    `https://api.github.com/gists/${ppmGistId}`,
    {
      files: {
        [ppmFileName]: {
          content: JSON.stringify(data, null, 2)
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`
      }
    }
  );
}

// 📊 CALCULAR AVG (USADO CADA 5 MIN)
async function refreshAveragePPM() {
  try {
    const data = await getPPMHistory();

    const values = data.history
      .map(x => Number(x.ppm))
      .filter(x => !isNaN(x) && x > 0);

    if (!values.length) {
      cachedAvgPPM = "0.00";
      return;
    }

    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    cachedAvgPPM = avg.toFixed(2);

    console.log("📊 Avg actualizado:", cachedAvgPPM);

  } catch (e) {
    console.error("❌ Avg error:", e);
  }
}

// 🧠 HELPERS
function cleanList(str) {
  if (!str) return [];
  return str.split(",").map(x => x.trim()).filter(Boolean);
}

function formatList(arr) {
  return arr.length ? arr.join(" • ") : "-";
}

function parseStats(content) {
  return {
    time: content.match(/Time:\s(.+?)\sPacks:/)?.[1] || "0",
    packs: Number(content.match(/Packs:\s(\d+)/)?.[1] || 0),
    ppm: Number(content.match(/Avg:\s([\d.]+)/)?.[1] || 0),
    online: cleanList(content.match(/Online:\s(.+)/)?.[1]),
    offline: cleanList(content.match(/Offline:\s(.+)/)?.[1])
  };
}

function findLastUserMessage(messages, username) {
  const name = username.toLowerCase();
  return messages.find(m => m.content.toLowerCase().includes(name));
}

// ⏱ FETCH MENSAJES
async function fetchMessagesByHours(channel, hours) {
  let all = [];
  let lastId = null;
  const limitTime = Date.now() - hours * 3600000;

  while (true) {
    const msgs = await channel.messages.fetch({ limit: 100, before: lastId });
    if (!msgs.size) break;

    for (const msg of msgs.values()) {
      if (msg.createdTimestamp < limitTime) return all;
      all.push(msg);
    }

    lastId = msgs.last().id;
  }
}

// 📊 GLOBAL
function calculateGlobalStats(onlineStats) {
  let totalPPM = 0;
  let totalInstances = 0;
  let totalPacks = 0;

  for (const s of onlineStats) {
    totalPPM += s.ppm;
    totalInstances += s.online.filter(x => x !== "1").length;
    totalPacks += s.packs;
  }

  lastTotalPPM = totalPPM;

  const users = onlineStats.length;

  return {
    totalPPM: totalPPM.toFixed(2),
    avgPPM: (users ? totalPPM / users : 0).toFixed(2),
    totalInstances,
    avgInstances: Math.round(users ? totalInstances / users : 0),
    totalPacks,
    ppmPerInstance: totalInstances ? (totalPPM / totalInstances).toFixed(2) : "0.00",
    users,
    minutesToGP: totalPPM ? (2000 / totalPPM).toFixed(1) : "0",
    gpPerHour: totalPPM ? (60 / (2000 / totalPPM)).toFixed(2) : "0.00"
  };
}

// 📊 PANEL
async function generatePanel() {
  const users = await fetchJSON(statsUrl);
  const onlineIDs = await fetchOnlineIDs(onlineUrl);
  const channel = await client.channels.fetch(heartbeatChannelId);

  const messages = await fetchMessagesByHours(channel, 12);

  let onlineList = [];
  let offlineList = [];
  let onlineStats = [];

  for (const key in users) {
    const user = users[key];

    const isOnline =
      onlineIDs.includes(user.main_id) ||
      (user.sec_id && onlineIDs.includes(user.sec_id));

    const msg = findLastUserMessage(messages, user.name);
    if (!msg) continue;

    const stats = parseStats(msg.content);

    if (isOnline) {
      onlineStats.push(stats);

      onlineList.push(
        `⚔️ **${user.name}**\n` +
        `⚡ ${stats.ppm} | 🎴 ${stats.packs} | ⏱ ${stats.time}\n` +
        `🔥 ${formatList(stats.online)}\n` +
        `💤 ${formatList(stats.offline)}`
      );
    } else {
      offlineList.push(
        `💤 **${user.name}** | 🎴 ${stats.packs} | ⏱ ${stats.time}`
      );
    }
  }

  const global = calculateGlobalStats(onlineStats);

  return [
    new EmbedBuilder()
      .setTitle("🐉 Dragon Reroll Dashboard")
      .setColor(0x5865F2)
      .addFields(
        { name: "🟢 ACTIVE", value: onlineList.join("\n\n") || "-" },
        { name: "🔴 INACTIVE", value: offlineList.join("\n") || "-" }
      ),

    new EmbedBuilder()
      .setTitle("📊 Global Stats")
      .setColor(0xF1C40F)
      .setDescription(
        `⚡ PPM\n# **${global.totalPPM}**\n📉 Avg 12h: **${cachedAvgPPM}**\n\n` +

        `📦 Packs: ${global.totalPacks}\n` +
        `⚡ Avg/user: ${global.avgPPM}\n` +
        `🔥 Instancias: ${global.totalInstances}\n` +
        `📊 PPM/inst: ${global.ppmPerInstance}\n\n` +

        `👥 ${global.users} users\n` +
        `📈 Avg inst: ${global.avgInstances}\n\n` +

        `🎯 ${global.minutesToGP} min / GP\n` +
        `🚀 ${global.gpPerHour} GP/h`
      )
  ];
}

// 🚀 START
client.once('ready', async () => {
  console.log(`✅ Ready: ${client.user.tag}`);

  const channel = await client.channels.fetch(panelChannelId);

  // 🔥 INIT AVG
  await refreshAveragePPM();

  const embeds = await generatePanel();
  panelMessage = await channel.send({ embeds });

  // 💾 PRIMER GUARDADO
  await storePPM(lastTotalPPM);

  // 🔄 PANEL
  setInterval(async () => {
    const embeds = await generatePanel();
    await panelMessage.edit({ embeds });
  }, 300000);

  // 🔄 ACTUALIZAR AVG CADA 5 MIN
  setInterval(refreshAveragePPM, 300000);

  // 💾 GUARDAR CADA 30 MIN
  setInterval(() => storePPM(lastTotalPPM), 1800000);
});

client.login(TOKEN);