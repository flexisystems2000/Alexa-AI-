const os = require("os");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { MessageMedia } = require("whatsapp-web.js");

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

const SCORE_FILE = path.join(
    __dirname,
    "scores.json"
);

let scores = {};

if (fs.existsSync(SCORE_FILE)) {

    try {

        scores = JSON.parse(
            fs.readFileSync(
                SCORE_FILE,
                "utf8"
            )
        );

    } catch (err) {

        console.error(
            "Failed loading scores.json",
            err
        );

        scores = {};
    }

} else {

    fs.writeFileSync(
        SCORE_FILE,
        JSON.stringify({}, null, 2)
    );
}

function saveScores() {

    try {

        fs.writeFileSync(
            SCORE_FILE,
            JSON.stringify(
                scores,
                null,
                2
            )
        );

    } catch (err) {

        console.error(
            "Failed saving scores",
            err
        );
    }
}

/**
 * ==========================
 * HTML CLEANER
 * ==========================
 */

function cleanHTML(text) {

    if (!text) return "";

    return text

        .replace(
            /<sup>(.*?)<\/sup>/gi,
            "^($1)"
        )

        .replace(
            /<sub>(.*?)<\/sub>/gi,
            "_($1)"
        )

        .replace(
            /<br\s*\/?>/gi,
            "\n"
        )

        .replace(
            /<\/?[^>]+(>|$)/g,
            ""
        )

        .trim();
}

/**
 * ==========================
 * DURATION PARSER
 * ==========================
 */

function parseDuration(timeStr) {

    if (!timeStr)
        return null;

    const match =
        timeStr.match(
            /^(\d+)(s|m|h)$/i
        );

    if (!match)
        return null;

    const value =
        parseInt(match[1]);

    const unit =
        match[2]
            .toLowerCase();

    switch (unit) {

        case "s":
            return value * 1000;

        case "m":
            return (
                value *
                60 *
                1000
            );

        case "h":
            return (
                value *
                60 *
                60 *
                1000
            );

        default:
            return null;
    }
}

/**
 * ==========================
 * ALOC QUIZ FETCHER
 * ==========================
 */

async function fetchQuiz(subject) {

    const response =
        await axios.get(
            `https://questions.aloc.com.ng/api/v2/q?subject=${encodeURIComponent(subject)}`,
            {
                headers: {
                    Accept:
                        "application/json",

                    "Content-Type":
                        "application/json",

                    AccessToken:
                        process.env.ALOC_TOKEN ||
                        "QB-7cee3a570a3683c2ef1f"
                }
            }
        );

    return response.data.data;
}
const routeCommand = async (
    command,
    args,
    msg,
    client
) => {

    const chat =
        await msg.getChat();

    switch (
        command.toLowerCase()
    ) {

        /**
         * =====================
         * MENU
         * =====================
         */

        case "menu":

            await msg.reply(`
╔════════════════════╗
      FLEXI AI
╚════════════════════╝

📌 GENERAL COMMANDS

!menu
!ping
!status
!time

!ai [question]

!quiz english
!quiz mathematics
!quiz chemistry
!quiz physics
!quiz biology

!score
!leaderboard

👮 GROUP ADMIN

!kick @user
!add 234xxxxxxxxxx

!ginfo
!gid

!mute
!mute 30s
!mute 10m
!mute 2h

!unmute
!unmute 30s
!unmute 10m
!unmute 2h

!listonline
`);

            break;

        /**
         * =====================
         * PING
         * =====================
         */

        case "ping":

            await msg.reply(
                "🏓 Pong!"
            );

            break;

        /**
         * =====================
         * STATUS
         * =====================
         */

        case "status": {

            const memory =
                (
                    process.memoryUsage()
                        .heapUsed /
                    1024 /
                    1024
                ).toFixed(2);

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

            await msg.reply(
                `🕒 ${new Date().toLocaleString(
                    "en-NG",
                    {
                        timeZone:
                            "Africa/Lagos"
                    }
                )}`
            );

            break;

        /**
         * =====================
         * AI
         * =====================
         */

                case "ai":
            if (!args.length) return msg.reply("Usage: !ai your question");

            try {
                const prompt = args.join(" ");
                
                // Add this log to see the request being sent
                console.log("Sending AI request to API...");

                const response = await axios.post("https://flexieduconsult-ai-link.onrender.com/ai", { prompt });

                // Add this log to see EXACTLY what the AI returned
                console.log("RAW API RESPONSE DATA:", JSON.stringify(response.data, null, 2));

                const reply = response.data.reply || response.data.response || "No response received.";
                await msg.reply(reply);

            } catch (err) {
                console.error("AI API Error:", err.message);
                await msg.reply("❌ AI server error. Check logs for details.");
            }
            break;
            
        /**
         * =====================
         * QUIZ
         * =====================
         */

        case "quiz": {

            if (!chat.isGroup) {

                return msg.reply(
                    "❌ Quiz works only in groups."
                );
            }

            if (
                activeQuiz[
                    msg.from
                ]
            ) {

                return msg.reply(
                    "⚠️ A quiz is already active in this group."
                );
            }

            const subject =
                (
                    args[0] ||
                    ""
                )
                    .toLowerCase();

            const allowed =
                [
                    "english",
                    "mathematics",
                    "chemistry",
                    "physics",
                    "biology"
                ];

            if (
                !allowed.includes(
                    subject
                )
            ) {

                return msg.reply(
                    `Usage:\n\n!quiz english\n!quiz mathematics\n!quiz chemistry\n!quiz physics\n!quiz biology`
                );
            }

            try {

                const q =
                    await fetchQuiz(
                        subject
                    );

                let question =
                    cleanHTML(
                        q.question
                    );

                let section =
                    cleanHTML(
                        q.section
                    );

                let solution =
                    cleanHTML(
                        q.solution
                    );

                /**
                 * IMAGE SUPPORT
                 */

                if (
                    q.image &&
                    q.image.trim() !== ""
                ) {

                    try {

                        const media =
                            await MessageMedia.fromUrl(
                                q.image
                            );

                        await chat.sendMessage(
                            media
                        );

                    } catch (err) {

                        console.error(
                            err
                        );
                    }
                }

                activeQuiz[
                    msg.from
                ] = {

                    answer:
                        (
                            q.answer ||
                            ""
                        )
                            .toUpperCase(),

                    solution,

                    question,

                    subject,

                    answered:
                        false
                };

                let text = `
🧠 FLEXI QUIZ

📚 Subject: ${subject}
📝 Exam: ${q.examtype || "N/A"} ${q.examyear || ""}

`;

                if (
                    section
                ) {

                    text +=
`${section}

`;
                }

                text +=
`${question}

A. ${q.option.a || ""}
B. ${q.option.b || ""}
C. ${q.option.c || ""}
D. ${q.option.d || ""}

Reply with:

A
B
C
D
`;

                await chat.sendMessage(
                    text
                );

            } catch (err) {

                console.error(
                    err
                );

                await msg.reply(
                    "❌ Failed to fetch quiz question."
                );
            }

            break;
        }

        /**
         * =====================
         * SCORE
         * =====================
         */

        case "score": {

            const user =
                msg.author ||
                msg.from;

            const total =
                scores[user] || 0;

            await msg.reply(
                `🏆 Your Score: ${total}`
            );

            break;
        }

        /**
         * =====================
         * LEADERBOARD
         * =====================
         */

        case "leaderboard": {

            const sorted =
                Object.entries(
                    scores
                )
                    .sort(
                        (
                            a,
                            b
                        ) =>
                            b[1] -
                            a[1]
                    )
                    .slice(
                        0,
                        10
                    );

            if (
                !sorted.length
            ) {

                return msg.reply(
                    "No scores yet."
                );
            }

            let board =
                "🏆 GLOBAL LEADERBOARD\n\n";

            for (
                let i = 0;
                i <
                sorted.length;
                i++
            ) {

                board +=
`${i + 1}. ${sorted[i][0]}
⭐ ${sorted[i][1]} points

`;
            }

            await msg.reply(
                board
            );

            break;
        }
                /**
         * =====================
         * GROUP COMMANDS
         * =====================
         */

        default:

            if (!chat.isGroup) {

                return msg.reply(
                    "❌ This command works only in groups."
                );
            }

            switch (
                command.toLowerCase()
            ) {

                /**
                 * =====================
                 * KICK
                 * =====================
                 */

                case "kick": {

                    const mentions =
                        await msg.getMentions();

                    if (
                        !mentions.length
                    ) {

                        return msg.reply(
                            "Usage: !kick @user"
                        );
                    }

                    try {

                        await chat.removeParticipants([
                            mentions[0]
                                .id
                                ._serialized
                        ]);

                        await msg.reply(
                            "✅ User removed."
                        );

                    } catch (err) {

                        console.error(
                            err
                        );

                        await msg.reply(
                            "❌ Failed to remove user."
                        );
                    }

                    break;
                }

                /**
                 * =====================
                 * ADD
                 * =====================
                 */

                case "add":

                    if (
                        !args[0]
                    ) {

                        return msg.reply(
                            "Usage: !add 234xxxxxxxxxx"
                        );
                    }

                    try {

                        await chat.addParticipants([
                            args[0] +
                            "@c.us"
                        ]);

                        await msg.reply(
                            "✅ User added."
                        );

                    } catch (err) {

                        console.error(
                            err
                        );

                        await msg.reply(
                            "❌ Failed to add user."
                        );
                    }

                    break;

                /**
                 * =====================
                 * GROUP INFO
                 * =====================
                 */

                case "ginfo":

                    await msg.reply(`
📌 GROUP INFO

📛 Name: ${chat.name}
👥 Members: ${chat.participants.length}

🆔 Group ID:

${chat.id._serialized}
`);

                    break;

                /**
                 * =====================
                 * GROUP ID
                 * =====================
                 */

                case "gid":

                    await msg.reply(
                        `🆔 ${chat.id._serialized}`
                    );

                    break;

                /**
                 * =====================
                 * MUTE
                 * =====================
                 */

                case "mute":

                    if (
                        args[0]
                    ) {

                        const duration =
                            parseDuration(
                                args[0]
                            );

                        if (
                            !duration
                        ) {

                            return msg.reply(
                                "Usage: !mute 30s | !mute 10m | !mute 2h"
                            );
                        }

                        await chat.setMessagesAdminsOnly(
                            true
                        );

                        await msg.reply(
                            `🔒 Group locked for ${args[0]}`
                        );

                        setTimeout(
                            async () => {

                                try {

                                    await chat.setMessagesAdminsOnly(
                                        false
                                    );

                                    await chat.sendMessage(
                                        "🔒 Timed lock expired. Group unmuted."
                                    );

                                } catch (
                                    err
                                ) {

                                    console.error(
                                        err
                                    );
                                }

                            },
                            duration
                        );

                    } else {

                        await chat.setMessagesAdminsOnly(
                            true
                        );

                        await msg.reply(
                            "🔒 Group locked."
                        );
                    }

                    break;

                /**
                 * =====================
                 * UNMUTE
                 * =====================
                 */

                case "unmute":

                    if (
                        args[0]
                    ) {

                        const duration =
                            parseDuration(
                                args[0]
                            );

                        if (
                            !duration
                        ) {

                            return msg.reply(
                                "Usage: !unmute 30s | !unmute 10m | !unmute 2h"
                            );
                        }

                        await chat.setMessagesAdminsOnly(
                            false
                        );

                        await msg.reply(
                            `🔓 Group unlocked for ${args[0]}`
                        );

                        setTimeout(
                            async () => {

                                try {

                                    await chat.setMessagesAdminsOnly(
                                        true
                                    );

                                    await chat.sendMessage(
                                        "🔓 Timed unlock expired. Group muted again."
                                    );

                                } catch (
                                    err
                                ) {

                                    console.error(
                                        err
                                    );
                                }

                            },
                            duration
                        );

                    } else {

                        await chat.setMessagesAdminsOnly(
                            false
                        );

                        await msg.reply(
                            "🔓 Group unlocked."
                        );
                    }

                    break;

                /**
                 * =====================
                 * LIST ONLINE
                 * =====================
                 */

                case "listonline":

                    await msg.reply(
                        "⚠ WhatsApp does not provide a list of online group members."
                    );

                    break;

                /**
                 * =====================
                 * UNKNOWN
                 * =====================
                 */

                default:

                    await msg.reply(
                        "❓ Unknown command. Type !menu"
                    );
            }
    }
};
module.exports = {
    routeCommand,
    activeQuiz,
    scores,
    saveScores
};
