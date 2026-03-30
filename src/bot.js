const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const { getPanel } = require('./panel');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let panelMessage = null;

client.once('ready', async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);

  const channel = await client.channels.fetch(config.panelChannelId);

  // Crear panel inicial
  const embed = await getPanel(client, config);
  panelMessage = await channel.send({ embeds: [embed] });

  // 🔁 Actualización automática cada 30s
  setInterval(async () => {
    try {
      const newEmbed = await getPanel(client, config);
      await panelMessage.edit({ embeds: [newEmbed] });
    } catch (err) {
      console.error("Error actualizando panel:", err);
    }
  }, 30000);
});

client.login(config.token);
