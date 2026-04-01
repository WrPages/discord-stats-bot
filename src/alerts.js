const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const HEARTBEAT_CHANNEL_ID = '1483616146996465735';
const CATEGORY_ID = '1488253270068691045';
const CHAMPION_ROLE_ID = '1486206362332434634';

const PUBLIC_ALERTS_CHANNEL_ID = '1488766924321198080';
const ELITE_IDS_GIST_ID = 'd9db3a72fed74c496fd6cc830f9ca6e9';

const GIST_USERS_URL = 'https://gist.githubusercontent.com/WrPages/bb18eda2ea748723d8fe0131dd740b70/raw/elite_users.json';

const MESSAGE_LIFETIME = 12 * 60 * 60 * 1000; // 🔥 12 HOURS
const CRASH_TIMEOUT = 45 * 60 * 1000;

const crashTimers = new Map();

// ================= LOAD REGISTERED USERS =================
async function loadUsers() {
    const response = await fetch(GIST_USERS_URL);
    return await response.json();
}

// ================= LOAD ELITE IDS =================
async function loadEliteIDs() {
    const res = await axios.get(`https://api.github.com/gists/${ELITE_IDS_GIST_ID}`, {
        headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    });

    const fileName = Object.keys(res.data.files)[0];
    const content = res.data.files[fileName].content;

    return {
        fileName,
        ids: content.split('\n').map(x => x.trim()).filter(Boolean)
    };
}

// ================= REMOVE ID FROM ELITE IDS =================
async function removeFromEliteIDs(gameId) {
    if (!gameId) return;

    const { fileName, ids } = await loadEliteIDs();
    const newList = ids.filter(id => id !== gameId);

    await axios.patch(
        `https://api.github.com/gists/${ELITE_IDS_GIST_ID}`,
        {
            files: {
                [fileName]: {
                    content: newList.join('\n')
                }
            }
        },
        { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } }
    );
}

// ================= PARSE OFFLINE =================
function parseOffline(content) {
    const match = content.match(/Offline:\s(.+)/i);
    if (!match) return { count: 0, hasMain: false };

    const list = match[1]
        .split(',')
        .map(x => x.trim().toLowerCase())
        .filter(Boolean);

    return {
        count: list.filter(x => x !== 'main' && x !== 'none').length,
        hasMain: list.includes('main')
    };
}

// ================= CHECK ONLINE INSTANCES =================
function noOnlineInstances(content) {
    const match = content.match(/Online:\s(.+)/i);
    if (!match) return true;

    const list = match[1]
        .split(',')
        .map(x => x.trim().toLowerCase())
        .filter(Boolean);

    return list.includes('none') || list.length === 0;
}

// ================= CLEAN OLD BOT MESSAGES =================
async function cleanOldMessages(client) {
    const now = Date.now();

    for (const guild of client.guilds.cache.values()) {

        // 🔹 Personal channels
        const personalChannels = guild.channels.cache.filter(c =>
            c.isTextBased() && c.name.startsWith("personal-")
        );

        for (const channel of personalChannels.values()) {
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

        // 🔹 Public alert channel
        const publicChannel = guild.channels.cache.get(PUBLIC_ALERTS_CHANNEL_ID);

        if (publicChannel) {
            const messages = await publicChannel.messages.fetch({ limit: 100 });

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

    console.log("🧹 12h cleanup executed");
}

// ================= MODULE =================
module.exports = (client) => {

    client.once('ready', () => {
        setInterval(() => cleanOldMessages(client), 60 * 60 * 1000);
    });

    client.on('messageCreate', async (message) => {

        try {

            if (message.channel.id !== HEARTBEAT_CHANNEL_ID) return;

            let content = message.content;
            if ((!content || content.trim() === "") && message.embeds.length > 0) {
                content = message.embeds[0].description || '';
            }

            if (!content) return;

            const firstLine = content.split('\n')[0].trim();
            const users = await loadUsers();

            const entry = Object.entries(users)
                .find(([id, data]) =>
                    data.name.toLowerCase() === firstLine.toLowerCase()
                );

            if (!entry) return;

            const [discordId, userData] = entry;
            const guild = message.guild;
            const member = await guild.members.fetch(discordId).catch(() => null);
            if (!member) return;

            const channelName = `personal-${userData.name.toLowerCase()}`;
            let userChannel = guild.channels.cache.find(c => c.name === channelName);

            if (!userChannel) {

                const championRole = guild.roles.cache.get(CHAMPION_ROLE_ID);

                userChannel = await guild.channels.create({
                    name: channelName,
                    parent: CATEGORY_ID,
                    permissionOverwrites: [
                        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                        { id: championRole.id, allow: [PermissionFlagsBits.ViewChannel] }
                    ]
                });
            }

            // 🔕 Silent heartbeat
            await userChannel.send({
                content:
                    `📡 **Heartbeat Update for ${userData.name}**\n\n` +
                    `\`\`\`\n${content}\n\`\`\``,
                flags: 4096
            });

            // ================= VALIDATE ONLINE STATUS =================
            const { ids } = await loadEliteIDs();
            const isOnlineGame =
                ids.includes(userData.main_id) ||
                ids.includes(userData.sec_id);

            const publicChannel = guild.channels.cache.get(PUBLIC_ALERTS_CHANNEL_ID);
            const { count, hasMain } = parseOffline(content);

            if (isOnlineGame) {

                if (count > 0) {
                    const orange = new EmbedBuilder()
                        .setColor(0xFFA500)
                        .setDescription(
                            `⚠️ ${member} You have **${count} offline instance${count > 1 ? 's' : ''}**.`
                        );

                    await userChannel.send({ embeds: [orange] });
                    if (publicChannel) await publicChannel.send({ embeds: [orange] });
                }

                if (hasMain) {
                    const red = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setDescription(
                            `🚨 ${member} Your **MAIN instance is OFFLINE**.`
                        );

                    await userChannel.send({ embeds: [red] });
                    if (publicChannel) await publicChannel.send({ embeds: [red] });
                }
            }

            // ================= CRASH DETECTOR =================
            const crashed = noOnlineInstances(content);

            if (crashed) {

                if (!crashTimers.has(discordId)) {

                    await userChannel.send({
                        content: `⏳ ${member} No active instances detected. Crash timer started (45 minutes).`,
                        flags: 4096
                    });

                    const timer = setTimeout(async () => {

                        await removeFromEliteIDs(userData.main_id);
                        await removeFromEliteIDs(userData.sec_id);

                        await userChannel.send(
                            `🛑 ${member} No recovery detected. User automatically marked OFFLINE.`
                        );

                        crashTimers.delete(discordId);

                    }, CRASH_TIMEOUT);

                    crashTimers.set(discordId, timer);
                }

            } else {

                if (crashTimers.has(discordId)) {
                    clearTimeout(crashTimers.get(discordId));
                    crashTimers.delete(discordId);

                    await userChannel.send({
                        content: `✅ ${member} Instances recovered. Crash detector cancelled.`,
                        flags: 4096
                    });
                }
            }

        } catch (err) {
            console.error("🔥 alerts.js error:", err);
        }
    });
};
