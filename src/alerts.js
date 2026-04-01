
const { 
    ChannelType, 
    PermissionFlagsBits 
} = require('discord.js');

const HEARTBEAT_CHANNEL_ID = '1483616146996465735';
const CATEGORY_ID = '1488253270068691045'; // opcional
const CHAMPION_ROLE_ID = '1486206362332434634';

// 🔥 PON AQUÍ EL RAW URL DE TU GIST
const GIST_URL = 'https://gist.githubusercontent.com/WrPages/bb18eda2ea748723d8fe0131dd740b70/raw/elite_users.json';

async function loadUsers() {
    const response = await fetch(GIST_URL);
    if (!response.ok) throw new Error('No se pudo cargar el Gist');
    return await response.json();
}

module.exports = (client) => {

    client.on('messageCreate', async (message) => {

        try {

            if (message.author.bot) return;
            if (message.channel.id !== HEARTBEAT_CHANNEL_ID) return;

            // Cargar usuarios dinámicamente desde Gist
            const registeredUsers = await loadUsers();

            const firstLine = message.content.split('\n')[0].trim();

            const entry = Object.entries(registeredUsers)
                .find(([discordId, data]) => data.name === firstLine);

            if (!entry) return;

            const [discordId, userData] = entry;

            const guild = message.guild;
            const channelName = `reroll-${userData.name.toLowerCase()}`;

            let userChannel = guild.channels.cache.find(
                c => c.name === channelName
            );

            if (!userChannel) {
                userChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: CATEGORY_ID || null,
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
            }

            await userChannel.send(
                `📡 **Nuevo Heartbeat:**\n\`\`\`\n${message.content}\n\`\`\``
            );

        } catch (err) {
            console.error('Error en alerts.js:', err);
        }
    });

};
