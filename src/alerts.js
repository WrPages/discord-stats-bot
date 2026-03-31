const DISCORD_TOKEN = process.env.LATIOS_TOKEN;

const HEARTBEAT_CHANNEL_ID = "1483616146996465735";
const ALERTS_CHANNEL_ID = "1484015417411244082";
const CATEGORY_ID = "1488253270068691045"; // opcional pero recomendado

const USERS_GIST_ID = "bb18eda2ea748723d8fe0131dd740b70";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder
} = require("discord.js");

const fetch = require("node-fetch");

// ===== CONFIG =====



const { Client, GatewayIntentBits, EmbedBuilder, ChannelType, PermissionsBitField } = require("discord.js");
const axios = require("axios");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ================= CONFIG =================
const DISCORD_TOKEN = "TU_TOKEN";
const HEARTBEAT_CHANNEL_ID = "CANAL_DONDE_LLEGA_EL_HEARTBEAT";
const ALERTS_CHANNEL_ID = "CANAL_PUBLICO_ALERTS";
const CATEGORY_ID = "CATEGORIA_CANALES_PRIVADOS";
const USERS_GIST_URL = "URL_RAW_DEL_GIST";

// ================= DATA =================
let usersMap = [];
let lastStates = {}; // anti-spam

// ================= LOAD USERS =================
async function loadUsers() {
  const res = await axios.get(USERS_GIST_URL);
  const data = res.data;

  usersMap = Object.entries(data).map(([discordId, user]) => ({
    discord_id: discordId,
    name: user.name,
    main_id: user.main_id,
    sec_id: user.sec_id
  }));

  console.log("Usuarios cargados:", usersMap.length);
}

// ================= PARSER =================
function parseMessage(content) {
  return {
    name: content.split("\n")[0].trim(),
    online: content.match(/Online:\s(.+)/)?.[1]?.split(",").map(x => x.trim()) || [],
    offline: content.match(/Offline:\s(.+)/)?.[1]?.split(",").map(x => x.trim()) || []
  };
}

// ================= CANAL PRIVADO =================
async function getUserChannel(guild, user) {
  const existing = guild.channels.cache.find(
    c => c.name === `user-${user.discord_id}`
  );

  if (existing) return existing;

  return await guild.channels.create({
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
        allow: [PermissionsBitField.Flags.ViewChannel]
      }
    ]
  });
}

// ================= ALERTA =================
async function sendAlert(guild, user, instance, isMain) {
  const alertsChannel = guild.channels.cache.get(ALERTS_CHANNEL_ID);
  const userChannel = await getUserChannel(guild, user);

  const color = isMain ? 0xE74C3C : 0xF39C12;

  const embed = new EmbedBuilder()
    .setTitle(isMain ? "🔴 MAIN OFFLINE" : "🟠 INSTANCE OFFLINE")
    .setDescription(`Instancia **${instance}** de **${user.name}** está offline`)
    .setColor(color)
    .setTimestamp();

  // Canal privado
  await userChannel.send({
    content: `<@${user.discord_id}>`,
    embeds: [embed]
  });

  // Canal público
  if (alertsChannel) {
    await alertsChannel.send({
      embeds: [embed]
    });
  }
}

// ================= HEARTBEAT HANDLER =================
client.on("messageCreate", async (msg) => {
  if (msg.channel.id !== HEARTBEAT_CHANNEL_ID) return;
  if (!msg.content) return;

  const data = parseMessage(msg.content);

  const normalize = (str) => str.toLowerCase();

  const user = usersMap.find(
    u => normalize(u.name) === normalize(data.name)
  );

  if (!user) return;

  const nowOffline = data.offline
    .map(x => x.toLowerCase())
    .filter(x => x !== "none");

  if (!lastStates[user.name]) {
    lastStates[user.name] = new Set();
  }

  for (const instance of nowOffline) {
    if (!lastStates[user.name].has(instance)) {
      const isMain = instance === "main";

      await sendAlert(msg.guild, user, instance, isMain);

      lastStates[user.name].add(instance);
    }
  }

  // limpiar cuando vuelven online
  const stillOffline = new Set(nowOffline);
  lastStates[user.name].forEach(inst => {
    if (!stillOffline.has(inst)) {
      lastStates[user.name].delete(inst);
    }
  });
});

// ================= READY =================
client.once("ready", async () => {
  console.log(`Bot listo como ${client.user.tag}`);
  await loadUsers();
});

// ================= LOGIN =================
client.login(DISCORD_TOKEN);