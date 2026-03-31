

const { Client, GatewayIntentBits, EmbedBuilder, ChannelType, PermissionsBitField } = require("discord.js");
const axios = require("axios");
const DISCORD_T


const { 
  Client, 
  GatewayIntentBits, 
  PermissionsBitField, 
  ChannelType 
} = require("discord.js");
const axios = require("axios");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ================= CONFIG =================

const DISCORD_TOKEN =  process.env.LATIOS_TOKEN;;
const HEARTBEAT_CHANNEL_ID = 1483616146996465735;
const GIST_ID = bb18eda2ea748723d8fe0131dd740b70;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const CATEGORY_NAME =Personal_channel || "REROLL USERS";

// ===========================================

// ======== Obtener usuarios desde Gist ========
async function fetchEliteUsers() {
  try {
    const response = await axios.get(
      `https://api.github.com/gists/${GIST_ID}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`
        }
      }
    );

    const files = response.data.files;
    const fileName = Object.keys(files)[0];
    const content = files[fileName].content;

    return JSON.parse(content);

  } catch (error) {
    console.error("❌ Error obteniendo Gist:", error.message);
    return null;
  }
}

// ======== Buscar usuario por nombre ========
function findUserByName(eliteUsers, username) {
  for (const discordId in eliteUsers) {
    if (eliteUsers[discordId].name === username) {
      return discordId;
    }
  }
  return null;
}

// ======== Crear categoría si no existe ========
async function getOrCreateCategory(guild) {
  let category = guild.channels.cache.find(
    c => c.name === CATEGORY_NAME && c.type === ChannelType.GuildCategory
  );

  if (!category) {
    console.log("📁 Creando categoría...");
    category = await guild.channels.create({
      name: CATEGORY_NAME,
      type: ChannelType.GuildCategory
    });
  }

  return category;
}

// ======== Crear canal privado ========
async function getOrCreatePrivateChannel(guild, userId) {

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    console.log("⚠ Usuario no está en el servidor");
    return null;
  }

  const channelName = `reroll-${member.user.username.toLowerCase()}`;

  let channel = guild.channels.cache.find(
    c => c.name === channelName
  );

  if (channel) return channel;

  const category = await getOrCreateCategory(guild);

  const championRole = guild.roles.cache.find(r => r.name === "Champion");

  const permissionOverwrites = [
    {
      id: guild.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: userId,
      allow: [PermissionsBitField.Flags.ViewChannel]
    }
  ];

  if (championRole) {
    permissionOverwrites.push({
      id: championRole.id,
      allow: [PermissionsBitField.Flags.ViewChannel]
    });
  }

  console.log(`📨 Creando canal para ${member.user.username}`);

  channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites
  });

  return channel;
}

// ================= EVENTOS =================

client.once("ready", () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {

  try {
    if (message.author.bot) return;
    if (message.channel.id !== HEARTBEAT_CHANNEL_ID) return;

    if (!message.content) return;

    const lines = message.content.split("\n");
    const username = lines[0].trim();

    if (!username) return;

    console.log("🔍 Username detectado:", username);

    const eliteUsers = await fetchEliteUsers();
    if (!eliteUsers) return;

    const discordId = findUserByName(eliteUsers, username);

    if (!discordId) {
      console.log("⚠ Usuario no registrado:", username);
      return;
    }

    const guild = message.guild;

    const privateChannel = await getOrCreatePrivateChannel(guild, discordId);
    if (!privateChannel) return;

    await privateChannel.send({
      content: `📦 **Nuevo Heartbeat Detectado**\n\n${message.content}`
    });

    console.log(`✅ Mensaje reenviado a ${username}`);

  } catch (error) {
    console.error("❌ Error procesando mensaje:", error);
  }

});

// ================= LOGIN =================

if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN no está definido en Railway");
  process.exit(1);
}

client.login(DISCORD_TOKEN);