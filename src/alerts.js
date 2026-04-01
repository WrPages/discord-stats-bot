// src/alerts.js

module.exports = (client) => {
    client.on('ready', () => {
        console.log('Sistema de alertas cargado correctamente');
    });

    // Ejemplo: alerta cuando alguien entra
    client.on('guildMemberAdd', member => {
        const channel = member.guild.systemChannel;
        if (channel) {
            channel.send(`Bienvenido ${member.user.username} al servidor! 🎉`);
        }
    });
};
