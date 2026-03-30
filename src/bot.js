const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');

// 🔐 TOKEN
const TOKEN = process.env.LATIOS_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // 👈 necesario para escribir en el gist

if (!TOKEN || !GITHUB_TOKEN) {
  console.error("❌ Missing LATIOS_TOKEN or GITHUB_TOKEN");
  process.exit(1);
}

// 📊 CONFIG
const statsUrl = "https://gist.githubusercontent.com/WrPages/bb18eda2ea748723d8fe0131dd740b70/raw/elite_users.json";
const onlineUrl = "https://gist.githubusercontent.com/WrPages/d9db3a72fed74c496fd6cc830f9ca6e9/raw/elite_ids.txt";

// 👉 TU NUEVO GIST
const ppmGistId = "fb7dd70fceaa1743943e67176352ffbd";
const ppmFileName = "ppm.json";

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

// 🧠 GIST READ
async function getPPMHistory() {
  try {
    const url = `https://api.github.com/gists/${ppmGistId}`;
    const res = await axios.get(url);

    const content = res.data.files[ppmFileName].content;
    return JSON.parse(content);
  } catch {
    return { history: [] };
  }
}

// 🧠 GIST WRITE
async function savePPMHistory(data) {
  const url = `https://api.github.com/gists/${ppmGistId}`;

  await axios.patch(url, {
    files: {
      [ppmFileName]: {
        content: JSON.stringify(data, null, 2)
      }
    }
  }, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`
    }
  });
}

// ➕ AGREGAR VALOR Y CALCULAR MEDIA
async function updatePPM(totalPPM) {
  const data = await getPPMHistory();

  data.history.push({
    timestamp: Date.now(),
    ppm: Number(totalPPM)
  });

  // mantener últimos 24 (12h)
  if (data.history.length > 24) {
    data.history = data.history.slice(-24);
  }

  await savePPMHistory(data);

  const values = data.history.map(x => x.ppm).filter(x => x > 0);

  const avg = values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : 0;

  return avg.toFixed(2);
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

// 🎨 FORMATO LISTAS
function formatList(arr) {
  if (!arr.length) return "-";
  return arr.join(" • ");
}

// 🧠 PARSE STATS
function parseStats(content) {
  const time = content.match(/Time:\s(.+?)\sPacks:/)?.[1] || "0";
  const packs = content.match(/Packs:\s(\d+)/)?.[1] || "0";
  const ppm = content.match(/Avg:\s([\d.]+)/)?.[1] || "0";

  const online = cleanList(content.match(/Online:\s(.+)/)?.[1]);
  const offline = cleanList(content.match(/Offline:\s(.+)/)?.[1]);

  return { time, packs, ppm, online, offline };
}

// 🔍 DETECTAR MENSAJE
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
function calculateGlobalStats(onlineStats) {
  let totalPPM = 0;
  let totalInstances = 0;

  for (const s of onlineStats) {
    totalPPM += Number(s.ppm);

    const filtered = s.online.filter(x => x !== "1");
    totalInstances += filtered.length;
  }

  const activeUsers = onlineStats.length;

  const avgPPM = activeUsers > 0 ? totalPPM / activeUsers : 0;
  const avgInstances = activeUsers > 0 ? totalInstances / activeUsers : 0;

  const expectedPacks = 2000;

  const minutesToGP = totalPPM > 0 ? expectedPacks / totalPPM : 0;
  const gpPerHour = totalPPM > 0 ? (60 / minutesToGP) : 0;

  return {
    totalPPM: totalPPM.toFixed(2),
    activeUsers,
    avgPPM: avgPPM.toFixed(2),
    avgInstances: Math.round(avgInstances),
    minutesToGP: minutesToGP.toFixed(1),
    gpPerHour: gpPerHour.toFixed(2)
  };
}

// 📊 GENERAR PANEL
async function generatePanel() {
  const users = await fetchJSON(statsUrl);
  const onlineIDs = await fetchOnlineIDs(onlineUrl);

  const channel = await client.channels.fetch(heartbeatChannelId);
  const messages12h = await fetchMessagesByHours(channel, 12);

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
          `⚡ ${stats.ppm} | 🎴 ${stats.packs} | ⏱ ${stats.time}\n` +
          `🔥 ${formatList(stats.online)}\n` +
          `💤 ${formatList(stats.offline)}`
        );

      } else {
        offlineList.push(
          `💤 **__${user.name}__** | 🎴 ${stats.packs} | ⏱ ${stats.time}`
        );
      }
    }
  }

  const global = calculateGlobalStats(onlineStats);

  // 💾 GUARDAR Y CALCULAR MEDIA
  const avg12h = await updatePPM(global.totalPPM);

  return [
    new EmbedBuilder()
      .setTitle("🐉 Dragon Reroll Dashboard")
      .setColor(0x5865F2)
      .addFields(
        {
          name: `🟢 ACTIVE (${onlineList.length})`,
          value: onlineList.join("\n\n") || "-"
        },
        {
          name: `🔴 INACTIVE (${offlineList.length})`,
          value: offlineList.join("\n") || "-"
        }
      ),

    new EmbedBuilder()
      .setTitle("📊 Global Stats")
      .setColor(0xF1C40F)
      .setDescription(
        `⚡ PPM\n` +
        `# **${global.totalPPM}**\n` +
        `📉 Avg 12h: **${avg12h}**\n\n` +

        `👥 ${global.activeUsers} rerollers\n` +
        `🔥 Avg instances: ${global.avgInstances}\n\n` +

        `🎯 ${global.minutesToGP} min / GP\n` +
        `🚀 ${global.gpPerHour} GP/hour`
      )
  ];
}

// 🚀 START
client.once('ready', async () => {
  console.log(`✅ Ready: ${client.user.tag}`);

  const panelChannel = await client.channels.fetch(panelChannelId);

  const embeds = await generatePanel();
  panelMessage = await panelChannel.send({ embeds });

  setInterval(async () => {
    const newEmbeds = await generatePanel();
    await panelMessage.edit({ embeds: newEmbeds });
  }, 300000);

  // 💾 GUARDAR PPM CADA 30 MIN
  setInterval(async () => {
    try {
      const users = await fetchJSON(statsUrl);
      const onlineIDs = await fetchOnlineIDs(onlineUrl);

      let onlineStats = [];

      for (const key in users) {
        const user = users[key];

        const isOnline =
          onlineIDs.includes(user.main_id) ||
          (user.sec_id && onlineIDs.includes(user.sec_id));

        if (isOnline) {
          // aquí solo sumamos ppm rápido (sin mensajes)
          onlineStats.push({ ppm: 1 }); // fallback mínimo
        }
      }

      const totalPPM = onlineStats.length;
      await updatePPM(totalPPM);

      console.log("💾 PPM guardado");
    } catch (e) {
      console.error("❌ Error guardando PPM:", e);
    }
  }, 1800000);
});

// 🔐 LOGIN
client.login(TOKEN);