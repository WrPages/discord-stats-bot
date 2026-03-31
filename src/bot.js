const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');

// 🔐 TOKENS
const TOKEN = process.env.LATIOS_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error("❌ Missing bot token");
  process.exit(1);
}

// 📊 CONFIG
const statsUrl = "https://gist.githubusercontent.com/WrPages/bb18eda2ea748723d8fe0131dd740b70/raw/elite_users.json";
const onlineUrl = "https://gist.githubusercontent.com/WrPages/d9db3a72fed74c496fd6cc830f9ca6e9/raw/elite_ids.txt";

const ppmGistId = "fb7dd70fceaa1743943e67176352ffbd";
const ppmFileName = "ppm.json";

const gpUrl = "https://gist.githubusercontent.com/WrPages/4773653072f4851e91958a333e503de9/raw/gp_live_stats.json";

const heartbeatChannelId = "1483616146996465735";
const panelChannelId = "1488126321786753156";

// 🤖 CLIENT
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

let panelMessage = null;
let lastTotalPPM = 0;
let cachedAvgPPM = "0.00";

// 📥 FETCH
async function fetchJSON(url) {
  const res = await axios.get(url);
  return res.data;
}

async function fetchOnlineIDs(url) {
  const res = await axios.get(url);
  return res.data.split("\n").map(x => x.trim()).filter(Boolean);
}

// 🧠 PPM
async function getPPMHistory() {
  try {
    const res = await axios.get(`https://api.github.com/gists/${ppmGistId}`);
    const file = res.data.files[ppmFileName];
    return file ? JSON.parse(file.content) : { history: [] };
  } catch {
    return { history: [] };
  }
}

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
    { headers: { Authorization: `Bearer ${GITHUB_TOKEN}` } }
  );
}

async function refreshAveragePPM() {
  const data = await getPPMHistory();

  const values = data.history.map(x => x.ppm).filter(x => x > 0);
  if (!values.length) return cachedAvgPPM = "0.00";

  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  cachedAvgPPM = avg.toFixed(2);
}

// 🧠 GP
async function getGPStats() {
  try {
    const data = await fetchJSON(`${gpUrl}?t=${Date.now()}`);

    const todayGP = data.daily?.gp || 0;
    const todayAlive = data.daily?.alive || 0;

    const history = data.history || [];

    let totalGP = todayGP;
    let totalAlive = todayAlive;

    for (const day of history) {
      totalGP += day.gp || 0;
      totalAlive += day.alive || 0;
    }

    const formatDate = (dateStr) => {
      const date = new Date(dateStr);
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${m}/${d}`;
    };

    const last5 = history.slice(0, 5);

    const historyText = last5.map(d =>
      `${formatDate(d.date)} → ${d.gp} GP | 💖 ${d.alive}`
    ).join("\n");

    return {
      todayGP,
      todayAlive,
      totalGP,
      totalAlive,
      historyText: historyText || "No data"
    };

  } catch (err) {
    console.error("GP ERROR:", err);
    return {
      todayGP: 0,
      todayAlive: 0,
      totalGP: 0,
      totalAlive: 0,
      historyText: "Error"
    };
  }
}

// 🧠 HELPERS
function cleanList(str) {
  if (!str) return [];
  return str.split(",").map(x => x.trim()).filter(Boolean);
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

async function fetchMessagesByHours(channel, hours) {
  let all = [];
  let lastId = null;
  const limit = Date.now() - hours * 3600000;

  while (true) {
    const msgs = await channel.messages.fetch({ limit: 100, before: lastId });
    if (!msgs.size) break;

    for (const msg of msgs.values()) {
      if (msg.createdTimestamp < limit) return all;
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
    totalInstances += s.online.length;
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

      const onlineCount = stats.online.filter(x => x.toLowerCase() !== "main").length;
      const offlineCount = stats.offline.includes("none") ? 0 : stats.offline.length;

      onlineList.push(
        `⚔️ **${user.name}**\n` +
        `⚡ ${stats.ppm} | 🧧 ${stats.packs} | ⏱ ${stats.time} | 🔥 ${onlineCount} | 💤 ${offlineCount}`
      );
    } else {
      offlineList.push(
        `💤 **${user.name}** | 🧧 ${stats.packs} | ⏱ ${stats.time}`
      );
    }
  }

  const global = calculateGlobalStats(onlineStats);
  const gp = await getGPStats();

  // 🔥 PANEL 1 (NO TOCADO)
  const usersEmbed = new EmbedBuilder()
    .setTitle("👥 Users Stats")
    .setColor(0x2ECC71)
    .setDescription(
      `🟢 **Online**\n${onlineList.join("\n") || "None"}\n\n` +
      `🔴 **Offline**\n${offlineList.join("\n") || "None"}`
    );

// 🔥 PANEL 2 (DASHBOARD REAL)
// 🔧 helper para columnas
// 🔧 FUNCIONES AUXILIARES (ponlas arriba)



// 🔥 PANEL 2 (tu dashboard)
const col = (text, width = 10) => {
  const len = text.length;
  const space = width - len;
  const left = Math.floor(space / 2);
  const right = space - left;
  return " ".repeat(left) + text + " ".repeat(right);
};

const colTitle = (text) => col(text, 11);
const colValue = (text) => col(text, 12); // 👈 más ancho para centrar números

function pad(value, width = 13) {
  return String(value).padStart(width, " ");
}

const globalEmbed = new EmbedBuilder()
  .setTitle("📊 Global Stats")
  .setColor(0x00D1FF)

  // 🔥 HEADER GRANDE
  .setDescription(
    `# ⚡ ${global.totalPPM} PPM\n` +
    `📉 Avg (12h): ${cachedAvgPPM}`
  )

  .addFields(
    {
      name: "\u200B",
      value:
        `👥 **Users**      │ 📦 **Packs**      │ ⚡ **Avg/User**\n` +
        `${pad(global.users)} │ ${pad(global.totalPacks)} │ ${pad(global.avgPPM)}`,
      inline: false
    },
    {
      name: "\u200B",
      value:
        `🔥 **Instances**  │ 📊 **Avg Inst.**  │ 🎯 **GP/h**\n` +
        `${pad(global.totalInstances)} │ ${pad(global.avgInstances)} │ ${pad(global.gpPerHour)}`,
      inline: false
    },
    {
      name: "\u200B",
      value:
        `⏱ **Min/GP**     │ 🌟 **Today GP**   │ 💫 **Total (5d)**\n` +
        `${pad(global.minutesToGP)} │ ${pad(gp.todayGP)} │ ${pad(gp.totalGP)}`,
      inline: false
    },
    {
      name: "\u200B",
      value:
        `💖 **Alive Today** │ 💖 **Alive Total** │ \u200B\n` +
        `${pad(gp.todayAlive)} │ ${pad(gp.totalAlive)} │ `,
      inline: false
    },

    {
      name: "📅 Last 5 Days",
      value: gp.historyText || "No data",
      inline: false
    }
  );

return [usersEmbed, globalEmbed];
}

// 🚀 START
client.once('ready', async () => {
  console.log(`✅ Ready: ${client.user.tag}`);

  const channel = await client.channels.fetch(panelChannelId);

  await refreshAveragePPM();

  const embeds = await generatePanel();

  const messages = await channel.messages.fetch({ limit: 20 });

  panelMessage = messages.find(
    msg =>
      msg.author.id === client.user.id &&
      msg.embeds.length > 0 &&
      msg.embeds.some(e => e.title === "📊 Global Stats")
  );

  if (panelMessage) {
    await panelMessage.edit({ embeds });
  } else {
    panelMessage = await channel.send({ embeds });
  }

  await storePPM(lastTotalPPM);

  setInterval(async () => {
    const embeds = await generatePanel();
    await panelMessage.edit({ embeds });
  }, 300000);

  setInterval(refreshAveragePPM, 300000);
  setInterval(() => storePPM(lastTotalPPM), 1800000);
});

client.login(TOKEN);