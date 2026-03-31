

const { Client, GatewayIntentBits, EmbedBuilder, ChannelType, PermissionsBitField } = require("discord.js");
const axios = require("axios");

// ================= CONFIG =================
const DISCORD_TOKEN = process.env.LATIOS_TOKEN;

const HEARTBEAT_CHANNEL_ID = "1483616146996465735";
const ALERTS_CHANNEL_ID = "1484015417411244082";
const CATEGORY_ID = "1488253270068691045"; // opcional pero recomendado

const USERS_GIST_ID = "bb18eda2ea748723d8fe0131dd740b70";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const { Client, GatewayIntentBits, EmbedBuilder, ChannelType, PermissionsBitField } = require("discord.js");
const axios = require("axios");



// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ================= DATA =================
let usersMap = [];
let lastStates = {};

// ================= LOAD USERS =================
async function loadUsers() {
  try {
    const res = await axios.get(USERS_GIST_URL);
    const data = res.data;

    usersMap = Object.entries(data).map(([discordId, user]) => ({
      discord_id: discordId,
      name: user.name,
      main_id: user.main_id,
      sec_id: user.sec_id
    }));

    console.log("✅ Usuarios cargados:", usersMap.length);
  } catch (err) {
    console.error("❌ Error cargando users:", err);
  }
}

// ================= PARSER =================
function parseMessage(content) {
  console.log("📩 Mensaje recibido:\n", content);

  return {
    name: content.split("\n")[0].trim(),
    online: content.match(/Online:\s(.+)/)?.[1]?.split(",").map(x => x.trim()) || [],
    offline: content.match(/Offline:\s(.+)/)?.[1]?.split(",").map(x => x.trim()) || []
  };
}

// ================= CANAL PRIVADO =================
async function getUserChannel(guild, user) {
  let channel = guild.channels.cache.find(
    c => c.name === `user-${user.discord_id}`
  );

  if (channel) return channel;

  console.log("📁 Creando canal para:", user.name);

  const championRole = guild.roles.cache.find(
    r => r.name.toLowerCase() === "champion"
  );

  channel = await guild.channels.create({
    name: `user-${user.discord_id}`,
    type: ChannelType.GuildText,
    parent: CATEGORY_ID,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: user.discord_id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages
        ]
      },
      ...(championRole ? [{
        id: championRole.id,
        allow: [PermissionsBitField.Flags.ViewChannel]
      }] : [])
    ]
  });

  return channel;
}

// ================= ALERTA =================
async function sendAlert(guild, user, instance, isMain) {
  console.log("🚨 ALERTA:", user.name, instance);

  const alertsChannel = guild.channels.cache.get(ALERTS_CHANNEL_ID);
  const userChannel = await getUserChannel(guild, user);

  const embed = new EmbedBuilder()
    .setTitle(isMain ? "🔴 MAIN OFFLINE" : "🟠 INSTANCE OFFLINE")
    .setDescription(`**${user.name}** → ${instance}`)
    .setColor(isMain ? 0xFF0000 : 0xFFA500)
    .setTimestamp();

  await userChannel.send({
    content: `<@${user.discord_id}>`,
    embeds: [embed]
  });

  if (alertsChannel) {
    await alertsChannel.send({ embeds: [embed] });
  } else {
    console.log("❌ Canal de alertas no encontrado");
  }
}

// ================= HEARTBEAT =================
client.on("messageCreate", async (msg) => {
  console.log("📩 EVENTO DETECTADO:", msg.content);
  console.log("📡 CANAL RECIBIDO:", msg.channel.id);
  console.log("🎯 CANAL ESPERADO:", HEARTBEAT_CHANNEL_ID);

  if (msg.author.bot) return;

  // 👇 deja esto para probar
});
  if (msg.author.bot) return;

  console.log("📡 Canal:", msg.channel.id);

  if (msg.channel.id !== HEARTBEAT_CHANNEL_ID) return;

  console.log("✅ Mensaje del canal correcto");

  const data = parseMessage(msg.content);

  const user = usersMap.find(
    u => u.name.toLowerCase() === data.name.toLowerCase()
  );

  if (!user) {
    console.log("❌ Usuario no encontrado:", data.name);
    return;
  }

  console.log("👤 Usuario detectado:", user.name);

  const nowOffline = data.offline
    .map(x => x.toLowerCase())
    .filter(x => x !== "none");

  if (!lastStates[user.name]) {
    lastStates[user.name] = new Set();
  }

  for (const inst of nowOffline) {
    if (!lastStates[user.name].has(inst)) {
      await sendAlert(msg.guild, user, inst, inst === "main");
      lastStates[user.name].add(inst);
    }
  }
});

// ================= READY =================
client.once("ready", async () => {
  console.log(`🚀 Bot listo: ${client.user.tag}`);
  await loadUsers();
});

// ================= LOGIN =================
client.login(DISCORD_TOKEN);