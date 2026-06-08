const fs = require("fs");
const path = require("path");

const BANNED_WORDS = ["badword1", "badword2", "insult1"]; 
const STRIKE_FILE = path.join(__dirname, "strikes.json");
let strikes = fs.existsSync(STRIKE_FILE) ? JSON.parse(fs.readFileSync(STRIKE_FILE, "utf8")) : {};

// Simple in-memory tracker for Antispam
const msgLog = {};

function saveStrikes() {
    fs.writeFileSync(STRIKE_FILE, JSON.stringify(strikes, null, 2));
}

async function runModeration(msg, sock) {
    const jid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || "";
    
    // Only moderate groups
    if (!jid.endsWith('@g.us')) return false;

    // 1. Anti-Sticker
    if (msg.message?.stickerMessage) {
        await sock.sendMessage(jid, { delete: msg.key });
        await handleStrike(jid, sender, "Sending Stickers", sock);
        return true; 
    }

    // 2. Anti-Spam (Max 5 messages in 3 seconds)
    const now = Date.now();
    msgLog[sender] = (msgLog[sender] || []).filter(time => now - time < 3000);
    msgLog[sender].push(now);
    if (msgLog[sender].length > 5) {
        await sock.sendMessage(jid, { text: "⚠️ Slow down! Antispam active." });
        return true;
    }

    // 3. Anti-Link
    const urlRegex = /(https?:\/\/[^\s]+|wa\.me\/[^\s]+)/gi;
    if (urlRegex.test(text)) {
        await sock.sendMessage(jid, { delete: msg.key });
        await handleStrike(jid, sender, "Sending Links", sock);
        return true;
    }

    // 4. Bad Words Filter
    if (BANNED_WORDS.some(word => text.toLowerCase().includes(word))) {
        await sock.sendMessage(jid, { delete: msg.key });
        await handleStrike(jid, sender, "Using Bad Language", sock);
        return true;
    }

    return false; // Message is safe
}

async function handleStrike(groupId, userId, reason, sock) {
    strikes[userId] = (strikes[userId] || 0) + 1;
    saveStrikes();

    if (strikes[userId] >= 3) {
        await sock.sendMessage(groupId, { 
            text: `🚫 @${userId.split('@')[0]} has 3 strikes. Kicking now!`, 
            mentions: [userId] 
        });
        await sock.groupParticipantsUpdate(groupId, [userId], 'remove');
        delete strikes[userId]; 
        saveStrikes();
    } else {
        await sock.sendMessage(groupId, { 
            text: `⚠️ Warning: ${reason}. Strike ${strikes[userId]}/3 for @${userId.split('@')[0]}`, 
            mentions: [userId] 
        });
    }
}

module.exports = { runModeration };
        
