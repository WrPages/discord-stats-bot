const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');

// 🔐 VARIABLES (solo estas desde Railway)
const TOKEN = process.env.LATIOS_TOKEN;

// 📊 CONFIG EN CÓDIGO
const CONFIG = {
  statsUrl: "https://gist.githubusercontent.com/WrPages/bb18eda2ea748723d8fe0131dd740b70/raw/elite_users.json",
  onlineUrl: "https://gist.githubusercontent.com/WrPages/d9db3a72fed74c496fd6cc830f9ca6e9/raw/elite_ids.txt",
  heartbeatChannelId: "1483616146996465735",
  panelChannelId: "1484015417411244082"
};

// 🚫 VALIDACIÓN
if (!TOKEN) {
  console.error("❌ Falta LATIOS_TOKEN");
  process.exit(1);
}

// 🤖 CLIENTE
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

let panelMessage = null;

// 📥 FETCH JSON
async function fetchJSON(url) {
  const res = await axios.get(url);
  return res.data;
}

// 📥 FETCH TXT (online IDs)
async function fetchOnlineIDs(url) {
  const res = await axios.get(url);
  return res.data
    .split("\n")
    .map(id => id.trim())
    .filter(Boolean);
}

// 🧠 PARSEAR MENSAJE
function parseStats(content) {
  const time = content.match(/Time:\s(.+?)\sPacks:/)?.[1] || "0";
  const packs = content.match(/Packs:\s(\d+)/)?.[1] || "0";
  const ppm = content.match(/Avg:\s([\d.]+)/)?.[1] || "0";
  const online = content.match(/Online:\s(.+)/)?.[1] || "0";
  const offline = content.match(/Offline:\s(.+)/)?.[1] || "0";

  return { time, packs, ppm, online, offline };
}

// 🔍 BUSCAR MENSAJE DEL USUARIO
function findUserMessage(messages, username) {
  return messages.find(msg => msg.content.startsWith(username));
}

// 📊 GENERAR PANEL
async function generatePanel() {
  const users = await fetchJSON(CONFIG.statsUrl);
  const onlineIDs = await fetchOnlineIDs(CONFIG.onlineUrl);

  const channel = await client.channels.fetch(CONFIG.heartbeatChannelId);
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
          `🟢 **${user.name}**\n` +
          `⚡ ${stats.ppm} ppm | 📦 ${stats.packs} | ⏱ ${stats.time}\n` +
          `🖥 ${stats.online} 🟢 / ${stats.offline} 🔴`
        );
      } else {
        onlineList.push(`🟢 **${user.name}** (sin datos)`);
      }

    } else {
      offlineList.push(`🔴 ${user.name}`);
    }
  }

  return new EmbedBuilder()
    .setTitle("🐉 Panel de Reroll")
    .setColor(0x5865F2)
    .addFields(
      {
        name: `🟢 Online (${onlineList.length})`,
        value: onlineList.join("\n\n") || "Nadie online"
      },
      {
        name: `🔴 Offline (${offlineList.length})`,
        value: offlineList.join("\n") || "Nadie offline"
      }
    )
    .setTimestamp();
}

// 🚀 BOT READY
client.once('ready', async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);

  const panelChannel = await client.channels.fetch(CONFIG.panelChannelId);

  // Crear panel inicial
  const embed = await generatePanel();
  panelMessage = await panelChannel.send({ embeds: [embed] });

  // 🔁 Actualizar cada 30s
  setInterval(async () => {
    try {
      const newEmbed = await generatePanel();
      await panelMessage.edit({ embeds: [newEmbed] });
    } catch (err) {
      console.error("❌ Error actualizando panel:", err);
    }
  }, 30000);
});

// 🔐 LOGIN
client.login(TOKEN);