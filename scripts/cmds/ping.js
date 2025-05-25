module.exports = {
 name: "ping",
 description: "Check bot response time.",
 permission: 0,
 cooldown: 5,
 async run({ sock, m }) {
 const startTime = Date.now();
 const sentMsg = await sock.sendMessage(m.key.remoteJid, { text: "Pinging..." }, { quoted: m });
 const pingTime = Date.now() - startTime;
 await sock.sendMessage(m.key.remoteJid, { edit: sentMsg.key, text: `Pong! 🏓 ${pingTime}ms` });
 }
};
