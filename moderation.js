// moderation.js
const BANNED_WORDS = ["badword1", "badword2", "insult1"]; // Add your words here

async function runModeration(msg, sock) {
    const text = msg.message?.conversation || 
                 msg.message?.extendedTextMessage?.text || 
                 msg.message?.imageMessage?.caption || "";

    const isGroup = msg.key.remoteJid.endsWith('@g.us');
    if (!isGroup) return false; // Don't moderate DMs

    // 1. Anti-Link Protection
    const urlRegex = /(https?:\/\/[^\s]+|wa\.me\/[^\s]+)/gi;
    if (urlRegex.test(text)) {
        await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
        await sock.sendMessage(msg.key.remoteJid, { text: "🚫 Links are not allowed in this group!" });
        return true; // Message was blocked
    }

    // 2. Bad Words Filter
    if (BANNED_WORDS.some(word => text.toLowerCase().includes(word))) {
        await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
        await sock.sendMessage(msg.key.remoteJid, { text: "⚠️ Inappropriate language detected and removed." });
        return true; // Message was blocked
    }

    return false; // Message is safe
}

module.exports = { runModeration };
