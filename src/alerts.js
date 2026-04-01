const { 
    ChannelType, 
    PermissionFlagsBits 
} = require('discord.js');

const registeredUsers = require('../elite_users.json');

const HEARTBEAT_CHANNEL_ID = '1483616146996465735';
const CATEGORY_ID = '1488253270068691045'; // opcional
const CHAMPION_ROLE_ID = '1486206362332434634';

module.exports = (client) => {

    client.on('messageCreate', async (message) => {

        try {

            if (message.author.bot) return;
            if (message.channel.id !== HEARTBEAT_CHANNEL_ID) return;

            // Primera línea = nombre del reroller
            const firstLine = message.content.split('\n')[0].trim();

            // Buscar en tu JSON
            const entry = Object.entries(registeredUsers)
                .find(([discordId, data]) => data.name === firstLine);

            if (!entry) return;

            const [discordId, userData] = entry;

            const guild = message.guild;
            const channelName = `reroll-${userData.name.toLowerCase()}`;

            let userChannel = guild.channels.cache.find(
                c => c.name === channelName
            );

            // Crear canal si no existe
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

                console.log(`Canal creado para ${userData.name}`);
            }

            await userChannel.send(
                `📡 **Nuevo Heartbeat:**\n\`\`\`\n${message.content}\n\`\`\``
            );

        } catch (err) {
            console.error('Error en alerts.js:', err);
        }
    });

};
