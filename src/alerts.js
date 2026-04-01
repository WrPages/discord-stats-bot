const { PermissionFlagsBits } = require('discord.js');

const HEARTBEAT_CHANNEL_ID = '1483616146996465735';
const CATEGORY_ID = '1488253270068691045';
const CHAMPION_ROLE_ID = '1486206362332434634';

const GIST_URL = 'https://gist.githubusercontent.com/WrPages/bb18eda2ea748723d8fe0131dd740b70/raw/elite_users.json';

async function loadUsers() {
    const response = await fetch(GIST_URL);
    if (!response.ok) throw new Error('Failed to load Gist');
    return await response.json();
}

module.exports = (client) => {

    console.log("✅ alerts.js loaded");

    client.on('messageCreate', async (message) => {

        try {

            // Only listen to heartbeat channel
            if (message.channel.id !== HEARTBEAT_CHANNEL_ID) return;

            console.log("👀 Heartbeat detected");

            // Get content (text or embed)
            let content = message.content;

            if ((!content || content.trim() === "") && message.embeds.length > 0) {
                content =
                    message.embeds[0].description ||
                    message.embeds[0].title ||
                    '';
            }

            if (!content) return;

            const firstLine = content.split('\n')[0].trim();
            console.log("Detected username:", firstLine);

            const registeredUsers = await loadUsers();

            // Find user by name
            const entry = Object.entries(registeredUsers)
                .find(([discordId, data]) =>
                    data.name.toLowerCase().trim() === firstLine.toLowerCase().trim()
                );

            if (!entry) {
                console.log("❌ User not registered");
                return;
            }

            const [discordId, userData] = entry;
            const guild = message.guild;

            // 🔥 Channel name format
            const channelName = `personal-${userData.name
                .toLowerCase()
                .replace(/\s+/g, '-')}`;

            let userChannel = guild.channels.cache.find(
                c => c.name === channelName
            );

            // If channel already exists → just send message
            if (userChannel) {
                await userChannel.send(
                    `📡 **Heartbeat Update for ${userData.name}**\n\n` +
                    `\`\`\`\n${content}\n\`\`\`\n` +
                    `_This channel automatically tracks your reroll activity._`
                );

                console.log("📨 Sent to existing channel");
                return;
            }

            // Check member exists
            const member = await guild.members.fetch(discordId).catch(() => null);
            if (!member) {
                console.log("❌ User not in server:", discordId);
                return;
            }

            const championRole = guild.roles.cache.get(CHAMPION_ROLE_ID);
            if (!championRole) {
                console.log("❌ Champion role not found");
                return;
            }

            console.log("📁 Creating personal channel for", userData.name);

            userChannel = await guild.channels.create({
                name: channelName,
                parent: CATEGORY_ID,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: member.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                        ],
                    },
                    {
                        id: championRole.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.ReadMessageHistory,
                        ],
                    },
                ],
            });

            console.log("✅ Channel created");

            await userChannel.send(
                `📡 **Heartbeat Update for ${userData.name}**\n\n` +
                `\`\`\`\n${content}\n\`\`\`\n` +
                `_This channel automatically tracks your reroll activity._`
            );

            console.log("📨 First heartbeat sent");

        } catch (err) {
            console.error('🔥 Error in alerts.js:', err);
        }
    });

};
