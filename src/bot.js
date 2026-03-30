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

// 🔍 FIND MESSAGE
function findUserMessage(messages, username) {
  return messages.find(m => m.content.startsWith(username));
}

// 📊 PANEL
async function generatePanel() {
  const users = await fetchJSON(statsUrl);
  const onlineIDs = await fetchOnlineIDs(onlineUrl);

  const channel = await client.channels.fetch(heartbeatChannelId);
  const messages = await channel.messages.fetch({ limit: 30 });

  let onlineList = [];
  let offlineList = [];

  for (const key in users) {
    const user = users[key];

    const isOnline =
      onlineIDs.includes(user.main_id) ||
      (user.sec_id && onlineIDs.includes(user.sec_id));

    if (isOnline) {
      const msg = findUserMessage(messages, user.name);

      if (msg) {
        const stats = parseStats(msg.content);

        onlineList.push(
          `⚔️ **${user.name}** | ⚡ ${stats.ppm} | 📦 ${stats.packs} | ⏱ ${stats.time}\n` +
          `🔥 Online: ${stats.online}\n` +
          `💤 Offline: ${stats.offline}`
        );
      } else {
        onlineList.push(`⚔️ **${user.name}** | No data`);
      }

    } else {
      offlineList.push(`💀 ${user.name}`);
    }
  }

  return new EmbedBuilder()
    .setTitle("🐉 Dragon Stats Panel")
    .setColor(0x5865F2)
    .addFields(
      {
        name: `🔥 Active (${onlineList.length})`,
        value: onlineList.join("\n\n") || "No active users"
      },
      {
        name: `💤 Inactive (${offlineList.length})`,
        value: offlineList.join("\n") || "No inactive users"
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

  setInterval(async () => {
    try {
      const newEmbed = await generatePanel();
      await panelMessage.edit({ embeds: [newEmbed] });
    } catch (err) {
      console.error("❌ Update error:", err);
    }
  }, 30000);
});

// 🔐 LOGIN
client.login(TOKEN);