const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const HEARTBEAT_CHANNEL_ID = '1483616146996465735';
const CATEGORY_ID = '1488253270068691045';
const CHAMPION_ROLE_ID = '1486206362332434634';
const PUBLIC_ALERTS_CHANNEL_ID = '1484015417411244082';

const GIST_URL = 'https://gist.githubusercontent.com/WrPages/bb18eda2ea748723d8fe0131dd740b70/raw/elite_users.json';

const MESSAGE_LIFETIME = 24 * 60 * 60 * 1000; // 24h

// 🔹 Load users from Gist
async function loadUsers() {
    const response = await fetch(GIST_URL);
    if (!response.ok) throw new Error('Failed to load Gist');
    return await response.json();
}

// 🔹 Detect offline instances
function parseOfflineInstances(content) {
    const offlineMatch = content.match(/Offline:\s(.+)/i);
    if (!offlineMatch) return { count: 0, hasMain: false };

    const list = offlineMatch[1]
        .split(',')
        .map(x => x.trim().toLowerCase())
        .filter(Boolean);

    const hasMain = list.includes('main');
    const numbered = list.filter(x => x !== 'main' && x !== 'none');

    return {
        count: numbered.length,
        hasMain
    };
}

// 🔹 Auto clean old bot messages (24h)
async function cleanOldMessages(client) {
    const now = Date.now();

    for (const guild of client.guilds.cache.values()) {

        const channels = guild.channels.cache.filter(c =>
            c.isTextBased() && c.name.startsWith("personal-")
        );

        for (const channel of channels.values()) {

            const messages = await channel.messages.fetch({ limit: 100 });

            for (const msg of messages.values()) {

                if (
                    msg.author.id === client.user.id &&
                    now - msg.createdTimestamp > MESSAGE_LIFETIME
                ) {
                    await msg.delete().catch(() => {});
                }
            }
        }
    }

    console.log("🧹 Old bot messages cleaned");
}

module.exports = (client) => {

    console.log("✅ alerts.js loaded");

    // 🔹 Start auto-clean every hour
    client.once('ready', () => {
        setInterval(() => {
            cleanOldMessages(client);
        }, 60 * 60 * 1000);
    });

    client.on('messageCreate', async (message) => {

        try {

            if (message.channel.id !== HEARTBEAT_CHANNEL_ID) return;

            let content = message.content;

            if ((!content || content.trim() === "") && message.embeds.length > 0) {
                content =
                    message.embeds[0].description ||
                    message.embeds[0].title ||
                    '';
            }

            if (!content) return;

            const firstLine = content.split('\n')[0].trim();

            const registeredUsers = await loadUsers();

            const entry = Object.entries(registeredUsers)
                .find(([discordId, data]) =>
                    data.name.toLowerCase().trim() === firstLine.toLowerCase().trim()
                );

            if (!entry) return;

            const [discordId, userData] = entry;
            const guild = message.guild;

            const channelName = `personal-${userData.name
                .toLowerCase()
                .replace(/\s+/g, '-')}`;

            let userChannel = guild.channels.cache.find(
                c => c.name === channelName
            );

            if (!userChannel) {

                const member = await guild.members.fetch(discordId).catch(() => null);
                if (!member) return;

                const championRole = guild.roles.cache.get(CHAMPION_ROLE_ID);
                if (!championRole) return;

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
            }

            // 🔕 Silent heartbeat message
            await userChannel.send({
                content:
                    `📡 **Heartbeat Update for ${userData.name}**\n\n` +
                    `\`\`\`\n${content}\n\`\`\`\n` +
                    `_Messages older than 24h are automatically deleted._`,
                flags: 4096 // suppress notification
            });

            // 🔥 OFFLINE ALERT SYSTEM
            const { count, hasMain } = parseOfflineInstances(content);

            const member = await guild.members.fetch(discordId).catch(() => null);
            if (!member) return;

            const publicChannel = guild.channels.cache.get(PUBLIC_ALERTS_CHANNEL_ID);

            // 🟠 Numbered instances offline
            if (count > 0) {

                const orangeEmbed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setDescription(
                        `⚠️ ${member} You have **${count} offline instance${count > 1 ? 's' : ''}**.`
                    )
                    .setTimestamp();

                await userChannel.send({ embeds: [orangeEmbed] });
                if (publicChannel) {
                    await publicChannel.send({ embeds: [orangeEmbed] });
                }
            }

            // 🔴 MAIN offline
            if (hasMain) {

                const redEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setDescription(
                        `🚨 ${member} Your **MAIN instance is OFFLINE**.`
                    )
                    .setTimestamp();

                await userChannel.send({ embeds: [redEmbed] });
                if (publicChannel) {
                    await publicChannel.send({ embeds: [redEmbed] });
                }
            }

        } catch (err) {
            console.error('🔥 Error in alerts.js:', err);
        }
    });
};
