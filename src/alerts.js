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
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

const HEARTBEAT_CHANNEL_ID = "ID_HEARTBEAT";
const ALERTS_CHANNEL_ID = "ID_ALERTS";
const CATEGORY_ID = "ID_CATEGORIA_CANALES";

const USERS_GIST_ID = "bb18eda2ea748723d8fe0131dd740b70";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// ===== CLIENT =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// ===== CACHE DE CANALES =====
const userChannels = new Map();

// ===== GET USERS =====
async function getUsers() {
  try {
    const res = await fetch(`https://api.github.com/gists/${USERS_GIST_ID}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });

    const data = await res.json();
    return JSON.parse(data.files["elite_users.json"].content || "{}");
  } catch {
    return {};
  }
}

// ===== CREAR CANAL PRIVADO =====
async function getOrCreateChannel(guild, discordId, username) {
  if (userChannels.has(discordId)) return userChannels.get(discordId);

  // buscar existente
  const existing = guild.channels.cache.find(
    c => c.name === `user-${username}`
  );

  if (existing) {
    userChannels.set(discordId, existing);
    return existing;
  }

  // crear nuevo
  const channel = await guild.channels.create({
    name: `user-${username}`,
    type: ChannelType.GuildText,
    parent: CATEGORY_ID || null,
    permissionOverwrites: [
      {
        id: guild.roles.everyone,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: discordId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ],
      },
    ],
  });

  userChannels.set(discordId, channel);
  return channel;
}

// ===== PARSEAR MENSAJE =====
function parseHeartbeat(content) {
  const usernameMatch = content.match(/^(.+?)\s*\(/);
  const username = usernameMatch ? usernameMatch[1].trim().toLowerCase() : null;

  const offlineMatch = content.match(/Offline:\s(.+)/);
  const offline = offlineMatch
    ? offlineMatch[1].split(",").map(x => x.trim()).filter(Boolean)
    : [];

  return { username, offline };
}

// ===== DETECTAR TIPO DE ALERTA =====
function getAlertType(userData, offlineList) {
  if (!offlineList.length) return null;

  const main = userData.main_id;
  const isMainOffline = offlineList.includes(main);

  return isMainOffline ? "critical" : "warning";
}

// ===== CREAR EMBED ALERTA =====
function buildAlertEmbed(username, offlineList, type) {
  const color = type === "critical" ? 0xff0000 : 0xffa500;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(type === "critical" ? "🔴 CRITICAL ALERT" : "🟠 Warning Alert")
    .setDescription(
      `**${username}** has offline instances:\n\n` +
      offlineList.map(x => `• ${x}`).join("\n")
    )
    .setTimestamp();
}

// ===== EVENTO PRINCIPAL =====
client.on("messageCreate", async (message) => {
  if (message.channel.id !== HEARTBEAT_CHANNEL_ID) return;

  const users = await getUsers();
  const { username, offline } = parseHeartbeat(message.content);

  if (!username) return;

  // buscar usuario en gist
  let discordId = null;
  let userData = null;

  for (const id in users) {
    if (users[id].name.toLowerCase() === username) {
      discordId = id;
      userData = users[id];
      break;
    }
  }

  if (!discordId) return;

  const guild = message.guild;

  // ===== CANAL PERSONAL =====
  const userChannel = await getOrCreateChannel(guild, discordId, username);

  // reenviar mensaje
  await userChannel.send({
    content: `📩 New heartbeat\n\n${message.content}`
  });

  // ===== ALERTAS =====
  const alertType = getAlertType(userData, offline);

  if (alertType) {
    const embed = buildAlertEmbed(username, offline, alertType);

    // canal personal
    await userChannel.send({ embeds: [embed] });

    // canal público
    const alertChannel = await client.channels.fetch(ALERTS_CHANNEL_ID);
    if (alertChannel) {
      await alertChannel.send({ embeds: [embed] });
    }
  }
});

// ===== READY =====
client.once("ready", () => {
  console.log(`✅ Bot listo: ${client.user.tag}`);
});

// ===== LOGIN =====
client.login(DISCORD_TOKEN);