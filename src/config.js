module.exports = {
  token: process.env.LATIOS_TOKEN,
  clientId: process.env.LATIOS_ID,
  guildId: process.env.GUILD_ID,
  statsUrl: process.env.STATS_URL

  // 📊 En código (tus 3 variables)
  statsUrl: "https://gist.githubusercontent.com/WrPages/bb18eda2ea748723d8fe0131dd740b70/raw/elite_users.json",      // registro de usuarios
  onlineUrl: "https://gist.githubusercontent.com/WrPages/d9db3a72fed74c496fd6cc830f9ca6e9/raw/elite_ids.txt",       // lista de IDs online
  heartbeatChannelId: "1483616146996465735"  // canal donde llegan stats
panelChannelId: "AQUI_CANAL_PANEL"
};
