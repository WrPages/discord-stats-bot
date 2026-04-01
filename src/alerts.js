const { PermissionFlagsBits } = require('discord.js');

const HEARTBEAT_CHANNEL_ID = '1483616146996465735';
const CATEGORY_ID = '1488253270068691045';
const CHAMPION_ROLE_ID = '1486206362332434634';

const GIST_URL = 'https://gist.githubusercontent.com/WrPages/bb18eda2ea748723d8fe0131dd740b70/raw/elite_users.json';

async function loadUsers() {
    const response = await fetch(GIST_URL);
    if (!response.ok) throw new Error('No se pudo cargar el Gist');
    return await response.json();
}

module.exports = (client) => {

    console.log("✅ alerts.js cargado");

    client.on('messageCreate', async (message) => {

        try {

            // Solo escuchar el canal heartbeat
            if (message.channel.id !== HEARTBEAT_CHANNEL_ID) return;

            console.log("👀 Heartbeat detectado");

            // 🔥 NO bloquear bots (el heartbeat viene de un bot)
            // if (message.author.bot) return;

            // Obtener contenido real (texto o embed)
            let content = message.content;

            if ((!content || content.trim() === "") && message.embeds.length > 0) {
                content =
                    message.embeds[0].description ||
                    message.embeds[0].title ||
                    '';
            }

            if (!content || content.trim() === "") {
                console.log("⚠ No hay contenido usable");
                return;
            }

            const firstLine = content.split('\n')[0].trim();
            console.log("Nombre detectado:", firstLine);

            const registeredUsers = await loadUsers();

            const entry = Object.entries(registeredUsers)
                .find(([discordId, data]) =>
                    data.name.toLowerCase().trim() === firstLine.toLowerCase().trim()
                );

            if (!entry) {
                console.log("❌ Usuario no registrado:", firstLine);
                return;
            }

            const [discordId, userData] = entry;

            const guild = message.guild;

            const channelName = `reroll-${userData.name
                .toLowerCase()
                .replace(/\s+/g, '-')}`;

            let userChannel = guild.channels.cache.find(
                c => c.name === channelName
            );

            // Crear canal si no existe
            if (!userChannel) {

                console.log("📁 Creando canal para", userData.name);

                userChannel = await guild.channels.create({
                    name: channelName,
                    parent: CATEGORY_ID,
                    permissionOverwrites: [
                        {
                            id: guild.id,
                            deny: [PermissionFlagsBits.ViewChannel],
                        },
                        {
                            id: discordId,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                            ],
                        },
                        {
                            id: CHAMPION_ROLE_ID,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.ReadMessageHistory,
                            ],
                        },
                    ],
                });

                console.log("✅ Canal creado");
            }

            await userChannel.send(
                `📡 **Nuevo Heartbeat:**\n\`\`\`\n${content}\n\`\`\``
            );

            console.log("📨 Heartbeat reenviado");

        } catch (err) {
            console.error('🔥 Error en alerts.js:', err);
        }
    });

};
