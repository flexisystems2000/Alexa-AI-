const os = require("os");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

/* ==========================
   IDENTITY HELPERS (SECURED)
========================== */

function getSender(msg) {
    // Strictly isolate author identification properties to avoid overlapping target scopes
    return (
        msg.author ||
        msg.key?.participant ||
        msg.message?.extendedTextMessage?.contextInfo?.participant ||
        msg.participant ||
        msg.key?.remoteJid ||
        null
    );
}

function getPhoneNumber(id) {
    if (!id) return "Unknown";
    let num = id.split("@")[0];
    if (num.startsWith("0")) num = "+234" + num.slice(1);
    else if (!num.startsWith("+")) num = "+" + num;
    return num;
}

function getBotId(sock) {
    return sock.user?.id?.split(":")[0] + "@s.whatsapp.net";
}

/* ==========================
   SAFE GROUP METADATA WITH MEMORY CACHE
========================== */

const metadataCache = new Map();
const CACHE_TTL = 30000;

async function getGroupMetadataSafe(sock, jid) {
    if (!jid?.endsWith("@g.us")) return null;

    const cached = metadataCache.get(jid);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }

    try {
        const data = await sock.groupMetadata(jid);
        metadataCache.set(jid, { data, timestamp: Date.now() });
        return data;
    } catch {
        return cached?.data || null;
    }
}

/* ==========================
   QUIZ SYSTEM & ASYNC STORAGE
========================== */

const activeQuiz = {};
const SCORE_FILE = path.join(__dirname, "scores.json");
let scores = {};
let isSaving = false;

if (fs.existsSync(SCORE_FILE)) {
    try {
        const raw = JSON.parse(fs.readFileSync(SCORE_FILE, "utf8"));
        scores = raw && typeof raw === "object" ? raw : {};
    } catch {
        scores = {};
    }
} else {
    fs.writeFileSync(SCORE_FILE, JSON.stringify({}, null, 2));
}

async function saveScores() {
    if (isSaving) return;
    isSaving = true;

    try {
        await fs.promises.writeFile(SCORE_FILE, JSON.stringify(scores, null, 2), "utf8");
    } catch (err) {
        console.error("Score save error:", err);
    } finally {
        isSaving = false;
    }
}

/* ==========================
   UTILITIES & EXTRACTORS
========================== */

function cleanHTML(text) {
    if (!text) return "";
    return text
        .replace(/<sup>(.*?)<\/sup>/gi, "^($1)")
        .replace(/<sub>(.*?)<\/sub>/gi, "_($1)")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/?[^>]+>/g, "")
        .trim();
}

function extractJid(msg) {
    return (
        msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
        msg.message?.extendedTextMessage?.contextInfo?.participant ||
        msg.message?.imageMessage?.contextInfo?.mentionedJid?.[0] ||
        msg.message?.videoMessage?.contextInfo?.mentionedJid?.[0] ||
        null
    );
}

async function fetchQuiz(subject) {
    const res = await axios.get(
        `https://questions.aloc.com.ng/api/v2/q?subject=${subject}`,
        {
            headers: {
                AccessToken: process.env.ALOC_TOKEN || "QB-7cee3a570a3683c2ef1f"
            },
            timeout: 10000
        }
    );
    return res.data.data;
}

/* ==========================
   PERMISSIONS RUNTIME CHECK
========================== */

async function getPermissions(sock, msg) {
    const isGroup = msg.from.endsWith("@g.us");
    if (!isGroup) return null;

    const metadata = await getGroupMetadataSafe(sock, msg.from);
    if (!metadata) return null;

    const sender = getSender(msg);
    const botId = getBotId(sock);

    const senderData = metadata.participants.find(p => p.id === sender);
    const botData = metadata.participants.find(p => p.id === botId);

    return {
        isAdmin: !!(senderData?.admin || senderData?.status === "admin" || senderData?.status === "superadmin"),
        botAdmin: !!(botData?.admin || botData?.status === "admin" || botData?.status === "superadmin"),
        metadata
    };
}

/* ==========================
   CENTRALIZED COMMAND ROUTER
========================== */

const routeCommand = async (command, args, msg, sock, botName, trackers = {}) => {
    const isGroup = msg.from.endsWith("@g.us");
    const { presenceStore } = trackers;

    switch (command.toLowerCase()) {

        /* ========== MENU ========== */
        case "menu":
            return msg.reply(`
🤖 *${botName.toUpperCase()} CORE ENGINE*

!ping
!status
!time
!ai [question]
!quiz [subject]
!answer [option]
!score
!leaderboard

*ADMINISTRATION:*
!kick @user
!add 234xxx
!promote @user
!demote @user
!ginfo
!gid
!mute
!unmute
!listonline
`);

        case "ping":
            return msg.reply("🏓 Pong!");

        case "status":
            return msg.reply(`
🟢 Online
💾 RAM: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB
⚡ OS: ${os.platform()}
⏱ Uptime: ${Math.floor(process.uptime())}s
`);

        case "time":
            return msg.reply(`🕒 ${new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}`);

        /* ========== AI SUITE ========== */
        case "ai":
            if (!args.length) return msg.reply("Usage: !ai question");
            try {
                const res = await axios.post(
                    "https://flexieduconsult-ai-link-z60r.onrender.com/ai",
                    { prompt: args.join(" "), botName },
                    { timeout: 20000 }
                );
                return msg.reply(res.data.result || res.data.reply || "No response");
            } catch {
                return msg.reply("❌ AI execution timeout or engine sleeping.");
            }

        /* ========== EDUCATIONAL GAMEPLAY ========== */
        case "quiz": {
            if (!isGroup) return msg.reply("❌ Quizzes can only run inside group threads.");
            if (activeQuiz[msg.from]) return msg.reply("⚠️ An active quiz execution is running in this workspace.");

            const subject = (args[0] || "").toLowerCase();
            const allowed = ["english", "mathematics", "chemistry", "physics", "biology"];

            if (!allowed.includes(subject))
                return msg.reply(`Use syntax: !quiz [${allowed.join('|')}]`);

            try {
                const q = await fetchQuiz(subject);
                if (!q?.question) return msg.reply("❌ Remote question profile data parsing exception.");

                activeQuiz[msg.from] = {
                    answer: (q.answer || "").toUpperCase().trim(),
                    solution: q.solution || ""
                };

                return msg.reply(
`🧠 *FLEXI COMPILATION ENGINE*

${cleanHTML(q.question)}

A. ${q.option?.a || 'N/A'}
B. ${q.option?.b || 'N/A'}
C. ${q.option?.c || 'N/A'}
D. ${q.option?.d || 'N/A'}

👉 *Reply:* \`!answer A/B/C/D\``
                );
            } catch {
                return msg.reply("❌ Failed to resolve network challenge request.");
            }
        }

        case "answer": {
            if (!isGroup) return msg.reply("❌ Score processing requires explicit group context.");

            const quiz = activeQuiz[msg.from];
            if (!quiz) return msg.reply("⚠️ No historical quiz matches currently operational.");

            const ans = (args[0] || "").toUpperCase().trim();
            if (!["A", "B", "C", "D"].includes(ans))
                return msg.reply("❌ Invalid format selection constraint applied.");

            const senderJid = getSender(msg);
            if (!senderJid) return msg.reply("❌ User resolution execution tracking dropped.");
            
            const user = getPhoneNumber(senderJid);
            const correctAnswer = quiz.answer;
            
            delete activeQuiz[msg.from]; // Atomically delete key to secure racing inputs

            if (ans === correctAnswer) {
                scores[user] = (scores[user] || 0) + 1;
                await saveScores();
                return msg.reply(`🎉 Correct! +1 user ranking score point.`);
            }

            return msg.reply(`❌ Incorrect option parsed.\nCorrect Alternative: ${correctAnswer}\nManual: ${cleanHTML(quiz.solution)}`);
        }

        case "score": {
            const user = getPhoneNumber(getSender(msg));
            return msg.reply(`🏆 Your Current Accumulated Score Balance: ${scores[user] || 0}`);
        }

        case "leaderboard": {
            const top = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 10);
            if (!top.length) return msg.reply("No scores found within execution storage profiles.");

            let text = "🏆 *GLOBAL LEADERBOARD METRICS*\n\n";
            const mentions = [];

            for (let i = 0; i < top.length; i++) {
                const phone = top[i][0].replace("+", "");
                const jid = `${phone}@s.whatsapp.net`;
                mentions.push(jid);
                text += `${i + 1}. @${phone} - *${top[i][1]} points*\n`;
            }

            return sock.sendMessage(msg.from, { text, mentions });
        }

        /* ========== SYSTEM ADMINISTRATION ACTIONS ========== */
        case "kick":
        case "add":
        case "promote":
        case "demote": {
            if (!isGroup) return msg.reply("❌ Operational gateway limited strictly to group origins.");

            const perm = await getPermissions(sock, msg);
            if (!perm?.isAdmin) return msg.reply("❌ Administrative policy exception: Access Denied.");
            if (!perm?.botAdmin) return msg.reply("❌ Privilege Error: Upgrade bot account profile status to administrator.");

            if (command === "add") {
                if (!args[0]) return msg.reply("Usage: !add 234xxxxxxxxxx");
                const target = args[0].replace(/[^\d]/g, "") + "@s.whatsapp.net";

                try {
                    await sock.groupParticipantsUpdate(msg.from, [target], "add");
                    metadataCache.delete(msg.from); // Evict stale metadata records instantly
                    return sock.sendMessage(msg.from, {
                        text: `✅ Added member tracking: @${target.split("@")[0]}`,
                        mentions: [target]
                    });
                } catch {
                    return msg.reply("❌ Protocol failed to directly pull the destination user registry.");
                }
            }

            const target = extractJid(msg);
            if (!target) return msg.reply("❌ Validation missing target context target tracking vectors.");

            try {
                await sock.groupParticipantsUpdate(
                    msg.from,
                    [target],
                    command === "kick" ? "remove" : command
                );
                metadataCache.delete(msg.from); // Evict cache after mutations

                return sock.sendMessage(msg.from, {
                    text: `✅ Administrative command [${command}] applied cleanly on @${target.split("@")[0]}`,
                    mentions: [target]
                });
            } catch {
                return msg.reply("❌ System configuration block or privilege level structure context failure.");
            }
        }

        case "ginfo": {
            if (!isGroup) return msg.reply("❌ Context domain limited to group properties.");

            const meta = await getGroupMetadataSafe(sock, msg.from);
            if (!meta) return msg.reply("❌ Error resolving structural group payload characteristics.");

            return msg.reply(`
📊 *WORKSPACE COMPOSITION ARCHITECTURE*
📝 Subject: ${meta.subject}
👥 Total Registries: ${meta.participants?.length || 0} items
🆔 Matrix Route ID: ${msg.from}
`);
        }

        case "gid":
            return msg.reply(isGroup ? msg.from : "❌ Context isolated outside active channels.");

        case "mute":
        case "unmute": {
            if (!isGroup) return msg.reply("❌ Context limits operational scope metrics to channel elements.");

            const perm = await getPermissions(sock, msg);
            if (!perm?.isAdmin) return msg.reply("❌ Authorization block: Administrative actions locked.");
            if (!perm?.botAdmin) return msg.reply("❌ Status update verification: Requires master level clearance parameters.");

            const lock = command === "mute";
            await sock.groupSettingUpdate(msg.from, lock ? "announcement" : "not_announcement");
            return msg.reply(lock ? "🔒 Channel closed. Dispatch permissions mapped exclusively to staff." : "🔓 Channel operational parameters open to general telemetry input.");
        }

        case "listonline": {
            if (!isGroup) return msg.reply("❌ Context engine isolated from local storage configurations.");

            const meta = await getGroupMetadataSafe(sock, msg.from);
            if (!meta) return msg.reply("❌ Configuration read pipeline terminated unexpectedly.");

            const online = meta.participants.filter(p =>
                presenceStore?.[msg.from]?.[p.id]?.lastKnownPresence !== "unavailable"
            );

            const jids = online.map(p => p.id);
            let responseString = `🟢 *Online Target Capacity metrics:* ${online.length}/${meta.participants.length}\n\n`;
            
            if (jids.length > 0) {
                responseString += jids.map(id => `• @${id.split("@")[0]}`).join("\n");
            } else {
                responseString += "_No data cached on recent presences inside network pipelines._";
            }

            return sock.sendMessage(msg.from, {
                text: responseString,
                mentions: jids
            });
        }

        default:
            return msg.reply("❓ Unknown functional instruction array parameter mapped.");
    }
};

module.exports = {
    routeCommand,
    activeQuiz,
    scores,
    saveScores
};
