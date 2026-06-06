const os = require("os");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

/**
 * ==========================
 * QUIZ STATE
 * ==========================
 */
const activeQuiz = {};

/**
 * ==========================
 * SCORE STORAGE
 * ==========================
 */
const SCORE_FILE = path.join(__dirname, "scores.json");
let scores = {};

if (fs.existsSync(SCORE_FILE)) {
    try {
        scores = JSON.parse(fs.readFileSync(SCORE_FILE, "utf8"));
    } catch (err) {
        console.error("Failed loading scores.json", err);
        scores = {};
    }
} else {
    fs.writeFileSync(SCORE_FILE, JSON.stringify({}, null, 2));
}

function saveScores() {
    try {
        fs.writeFileSync(SCORE_FILE, JSON.stringify(scores, null, 2));
    } catch (err) {
        console.error("Failed saving scores", err);
    }
}

/**
 * ==========================
 * HTML & DURATION HELPERS
 * ==========================
 */
function cleanHTML(text) {
    if (!text) return "";
    return text
        .replace(/<sup>(.*?)<\/sup>/gi, "^($1)")
        .replace(/<sub>(.*?)<\/sub>/gi, "_($1)")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/?[^>]+(>|$)/g, "")
        .trim();
}

function parseDuration(timeStr) {
    if (!timeStr) return null;
    const match = timeStr.match(/^(\d+)(s|m|h)$/i);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    switch (unit) {
        case "s": return value * 1000;
        case "m": return value * 60 * 1000;
        case "h": return value * 60 * 60 * 1000;
        default: return null;
    }
}

async function fetchQuiz(subject) {
    const response = await axios.get(
        `https://questions.aloc.com.ng/api/v2/q?subject=${encodeURIComponent(subject)}`,
        {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                AccessToken: process.env.ALOC_TOKEN || "QB-7cee3a570a3683c2ef1f"
            }
        }
    );
    return response.data.data;
}
const routeCommand = async (command, args, msg, sock, botName) => {
    // Determine if it is a group
    const isGroup = msg.from.endsWith('@g.us');

    switch (command.toLowerCase()) {
        /**
         * =====================
         * MENU
         * =====================
         */
        case "menu":
            await msg.reply(`
╔════════════════════╗
      ${botName.toUpperCase()} AI
╚════════════════════╝

📌 GENERAL COMMANDS
!menu 
!ping 
!status 
!time
!ai [question]
!quiz [subject]
!score 
!leaderboard

👮 GROUP ADMIN
!kick @user
!add 234xxxxxxxxxx
!ginfo 
!gid
!mute [time] 
!unmute [time]
`);
            break;

        /**
         * =====================
         * PING
         * =====================
         */
        case "ping":
            await msg.reply("🏓 Pong!");
            break;

        /**
         * =====================
         * STATUS
         * =====================
         */
        case "status": {
            const memory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
            await msg.reply(`
📊 BOT STATUS

🟢 Status: Online
💾 RAM Usage: ${memory} MB
⚡ Platform: ${os.platform()}
🕒 Uptime: ${Math.floor(process.uptime())} seconds
`);
            break;
        }

        /**
         * =====================
         * TIME
         * =====================
         */
        case "time":
            await msg.reply(`🕒 ${new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}`);
            break;
        /**
         * =====================
         * AI
         * =====================
         */
                case "ai":
            if (!args.length) return msg.reply("Usage: !ai your question");
            
            console.log("DEBUG: Initiating AI Request...");
            
            try {
                const prompt = args.join(" ");
                console.log("DEBUG: Prompt is:", prompt);
                console.log("DEBUG: Sending POST to: https://flexieduconsult-ai-link-z60r.onrender.com/ai");

                const response = await axios.post("https://flexieduconsult-ai-link-z60r.onrender.com/ai", { 
                    prompt: prompt,
                    botName: botName 
                }, { timeout: 10000 }); // Added a 10s timeout to prevent hanging

                console.log("DEBUG: Request successful. Data received.");
                
                const reply = response.data.result || response.data.reply || "No response received.";
                await msg.reply(reply);
            } catch (err) {
                console.error("DEBUG: AI Request FAILED!");
                
                if (err.response) {
                    // Server responded with a status code outside the 2xx range
                    console.error("DEBUG: Response Data:", err.response.data);
                    console.error("DEBUG: Status:", err.response.status);
                    await msg.reply(`❌ AI API Error: Status ${err.response.status}`);
                } else if (err.request) {
                    // Request was made but no response was received
                    console.error("DEBUG: No response received (Network timeout/offline).");
                    await msg.reply("❌ AI server is offline or timed out.");
                } else {
                    // Something happened in setting up the request
                    console.error("DEBUG: Error Message:", err.message);
                    await msg.reply(`❌ Setup Error: ${err.message}`);
                }
            }
            break;
            
        /**
         * =====================
         * QUIZ
         * =====================
         */
        case "quiz": {
            if (!isGroup) return msg.reply("❌ Quiz works only in groups.");
            if (activeQuiz[msg.from]) return msg.reply("⚠️ A quiz is already active.");

            const subject = (args[0] || "").toLowerCase();
            const allowed = ["english", "mathematics", "chemistry", "physics", "biology"];
            if (!allowed.includes(subject)) {
                return msg.reply(`Usage:\n!quiz [${allowed.join('|')}]`);
            }

            try {
                const q = await fetchQuiz(subject);
                let question = cleanHTML(q.question);
                let section = cleanHTML(q.section);
                let solution = cleanHTML(q.solution);

                // Image Handling for Baileys
                if (q.image && q.image.trim() !== "") {
                    try {
                        await sock.sendMessage(msg.from, { image: { url: q.image } });
                    } catch (err) {
                        console.error("Quiz Image Error:", err);
                    }
                }

                activeQuiz[msg.from] = {
                    answer: (q.answer || "").toUpperCase(),
                    solution, question, subject, answered: false
                };

                let text = `🧠 FLEXI QUIZ\n\n📚 Subject: ${subject}\n📝 Exam: ${q.examtype || "N/A"} ${q.examyear || ""}\n\n`;
                if (section) text += `${section}\n\n`;
                text += `${question}\n\nA. ${q.option.a || ""}\nB. ${q.option.b || ""}\nC. ${q.option.c || ""}\nD. ${q.option.d || ""}\n\nReply with A, B, C, or D.`;

                await msg.reply(text);
            } catch (err) {
                console.error(err);
                await msg.reply("❌ Failed to fetch quiz question.");
            }
            break;
        }
        /**
         * =====================
         * SCORE
         * =====================
         */
        case "score": {
            const user = msg.author || msg.from;
            const total = scores[user] || 0;
            await msg.reply(`🏆 Your Score: ${total}`);
            break;
        }

        /**
         * =====================
         * LEADERBOARD
         * =====================
         */
        case "leaderboard": {
            const sorted = Object.entries(scores)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);

            if (!sorted.length) return msg.reply("No scores yet.");

            let board = "🏆 GLOBAL LEADERBOARD\n\n";
            for (let i = 0; i < sorted.length; i++) {
                board += `${i + 1}. ${sorted[i][0]}\n⭐ ${sorted[i][1]} points\n\n`;
            }
            await msg.reply(board);
            break;
        }

        /**
         * =====================
         * GROUP COMMANDS GATEWAY
         * =====================
         */
        default:
            if (!isGroup) return msg.reply("❌ This command works only in groups.");

            switch (command.toLowerCase()) {
                /**
                /**
                 * =====================
                 * KICK
                 * =====================
                 */
                case "kick": {
                    const participant = msg.author || (msg.message?.extendedTextMessage?.contextInfo?.participant);
                    if (!participant) return msg.reply("Usage: !kick @user (reply to them)");
                    
                    try {
                        await sock.groupParticipantsUpdate(msg.from, [participant], 'remove');
                        await msg.reply("✅ User removed.");
                    } catch (err) {
                        console.error(err);
                        await msg.reply("❌ Failed to remove user. Ensure I am an admin.");
                    }
                    break;
                }

                /**
                 * =====================
                 * ADD
                 * =====================
                 */
                case "add":
                    if (!args[0]) return msg.reply("Usage: !add 234xxxxxxxxxx");
                    try {
                        await sock.groupParticipantsUpdate(msg.from, [args[0].replace(/[^0-9]/g, '') + "@s.whatsapp.net"], 'add');
                        await msg.reply("✅ User added.");
                    } catch (err) {
                        console.error(err);
                        await msg.reply("❌ Failed to add user.");
                    }
                    break;

                /**
                 * =====================
                 * MUTE / UNMUTE (Lock/Unlock)
                 * =====================
                 */
                case "mute":
                case "unmute": {
                    const isLock = command === "mute";
                    await sock.groupSettingUpdate(msg.from, isLock ? 'announcement' : 'not_announcement');
                    await msg.reply(`🔒 Group ${isLock ? 'locked' : 'unlocked'}.`);
                    
                    if (args[0]) {
                        const duration = parseDuration(args[0]);
                        if (duration) {
                            setTimeout(async () => {
                                await sock.groupSettingUpdate(msg.from, isLock ? 'not_announcement' : 'announcement');
                                await sock.sendMessage(msg.from, { text: `Timed ${isLock ? 'lock' : 'unlock'} expired.` });
                            }, duration);
                        }
                    }
                    break;
                }

                default:
                    await msg.reply("❓ Unknown command. Type !menu");
            }
    }
};

module.exports = { routeCommand, activeQuiz, scores, saveScores };
