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

// 📥 FETCH JSON
async function fetchJSON(url) {
  const res = await axios.get(url);
  return res.data;
}

// 📥 FETCH TXT
async function fetchOnlineIDs(url) {
  const res = await axios.get(url);
  return res.data
    .split("\n")
    .map(id => id.trim())
    .filter(Boolean);
}

// 🧠 PARSE STATS
function parseStats(content) {
  const time = content.match(/Time:\s(.+?)\sPacks:/)?.[1] || "0";
  const packs = content.match(/Packs:\s(\d+)/)?.[1] || "0";
  const ppm = content.match(/Avg:\s([\d.]+)/)?.[1] || "0";

  const online = content.match(/Online:\s(.+)/)?.[1] || "-";
  const offline = content.match(/Offline:\s(.+)/)?.[1] || "-";

  return { time, packs, ppm, online, offline };
}

// 🔍 BUSCAR ÚLTIMO MENSAJE DE USUARIO
function findLastUserMessage(messages, username) {
  const lowerName = username.toLowerCase();

  return messages.find(msg => {
    const content = msg.content.toLowerCase();

    return (
      content.startsWith(lowerName) ||
      content.includes(`\n${lowerName}`) ||
      content.includes(lowerName)
    );
  });
}

// 📥 OBTENER HASTA 500 MENSAJES
async function fetchLastMessages(channel) {
  let allMessages = [];
  let lastId = null;

  while (allMessages.length < 500) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const messages = await channel.messages.fetch(options);
    if (!messages.size) break;

    allMessages.push(...messages.values());
    lastId = messages.last().id;
  }

  return allMessages;
}

// 📊 PANEL
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

      const userLine =
        `⚔️ **${user.name}** | ⚡ ${stats.ppm} | 📦 ${stats.packs} | ⏱ ${stats.time}\n` +
        `🔥 ${stats.online}\n` +
        `💤 ${stats.offline}`;

      if (isOnline) {
        onlineList.push(userLine);
      } else {
        offlineList.push(userLine);
      }

    } else {
      const noData = `⚔️ **${user.name}** | No data`;

      if (isOnline) {
        onlineList.push(noData);
      } else {
        offlineList.push(noData);
      }
    }
  }

  return new EmbedBuilder()
    .setTitle("🐉 Dragon Reroll Dashboard")
    .setColor(0x5865F2)
    .addFields(
      {
        name: `🟢 **ACTIVE USERS (${onlineList.length})**`,
        value: onlineList.join("\n\n") || "No active users"
      },
      {
        name: `🔴 **INACTIVE USERS (${offlineList.length})**`,
        value: offlineList.join("\n\n") || "No inactive users"
      }
    )
    .setTimestamp();
}

// 🚀 READY
client.once('ready', async () => {
  console.log(`✅ Bot ready: ${client.user.tag}`);

  const panelChannel = await client.channels.fetch(panelChannelId);

  const embed = await generatePanel();
  panelMessage = await panelChannel.send({ embeds: [embed] });

  // 🔁 ACTUALIZAR CADA 5 MINUTOS
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