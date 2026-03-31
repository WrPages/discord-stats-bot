const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log("🔥 BOT ENCENDIDO");
});

client.on("messageCreate", (message) => {
  console.log("📩 MENSAJE DETECTADO");
  console.log("Canal:", message.channel.id);
  console.log("Autor:", message.author.username);
  console.log("Contenido:", message.content);
});

client.login(process.env.LATIOS_TOKEN);