const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const fs = require("fs");
const path = require("path");

let logBuffer = [];
const MAX_LOGS = 50; // Keep the last 50 logs

// Override console.log to capture it
const originalLog = console.log;
console.log = function(...args) {
    const message = args.join(' ');
    logBuffer.push(`[${new Date().toLocaleTimeString()}] ${message}`);
    if (logBuffer.length > MAX_LOGS) logBuffer.shift(); // Remove oldest log
    originalLog.apply(console, args);
};


const SESSION_FILE = path.join(__dirname, "session.json");
let sessionData = fs.existsSync(SESSION_FILE) ? JSON.parse(fs.readFileSync(SESSION_FILE, "utf8")) : { pairedNumber: null };

// Add this line with your other requires
const { runModeration } = require('./moderation'); 

function saveSession(data) {
    sessionData = data;
    fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
}

// --- SYSTEM GUARDS (Keeps the bot from crashing on minor errors) ---
process.on('uncaughtException', (err) => console.log('⚠️ System Error:', err.message));
process.on('unhandledRejection', (err) => console.log('⚠️ Rejection Guard:', err.message));

const { routeCommand, activeQuiz, scores, saveScores } = require('./commandRouter');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'alexa-secret-key',
    resave: false,
    saveUninitialized: true
}));

let sock;

const groupActivity = {};
const userActivity = {};
const presenceStore = {};

const extractText = (msg) => {
    return msg.message?.conversation || 
           msg.message?.extendedTextMessage?.text || 
           msg.message?.imageMessage?.caption || "";
};

function normalize(text) {
    return (text || "")
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

  const isAlexaReact = (text) => {
    const t = normalize(text);
    return t.startsWith("alexa react") && t.includes("online");
};

const isAlexaOnlineQuestion = (text) => {
    const t = normalize(text);

    return (
        t.includes("alexa are you online") ||
        t.includes("alexa are u online") ||
        t.includes("alexa are you there") ||
        t.includes("alexa are u there") ||
        t.includes("alexa online")
    );
};

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['Windows', 'Chrome', '124.0.6367.61'], 
        generateHighQualityLinkPreview: true,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        patchMessageBeforeSending: (msg) => {
            const needsPatch = !!(msg.buttonsMessage || msg.templateMessage || msg.listMessage);
            if (needsPatch) {
                msg = {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                            ...msg,
                        },
                    },
                };
            }
            return msg;
        }
    });

    sock.ev.on('creds.update', saveCreds);

sock.ev.on("presence.update", (update) => {

    const { id, presences } = update;

    if (!presenceStore[id]) {
        presenceStore[id] = {};
    }

    Object.assign(
        presenceStore[id],
        presences
    );

});

    sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection === 'close') {
        const statusCode = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output.statusCode : null;
        
        // If the user manually logged out via your "Terminate Session" button
        if (statusCode === DisconnectReason.loggedOut) {
            console.log('🔌 Session terminated by user.');
            saveSession({ pairedNumber: null }); // Clear the UI on the dashboard
        } else {
            // Otherwise, reconnect automatically
            console.log('⚠️ Connection lost, reconnecting...');
            startBot();
        }
    } else if (connection === 'open') {
        console.log('✅ Baileys Client Ready');
        // Optional: Perform any 'post-login' tasks here
    }
    });
    

    // --- GROUP PARTICIPANT EVENTS (MOVED INSIDE) ---
    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;
        if (!participants || participants.length === 0) return;
        const num = participants[0]; 
        const phoneNumber = num.split('@')[0];
        const groupMetadata = await sock.groupMetadata(id).catch(() => ({ subject: "this group" }));
       for (const member of groupMetadata.participants || []) {
    try {
        await sock.presenceSubscribe(member.id);
    } catch {}
}

        if (action === 'add') {
            const welcomeMsg = `👋 *WELCOME*\nHello @${phoneNumber}, welcome to *${groupMetadata.subject}!*\n\n📖 Please read the group description and follow all guidelines.`;
            await sock.sendMessage(id, { text: welcomeMsg, mentions: [num] });
        } 
        else if (action === 'remove' || action === 'leave') {
            const reason = action === 'remove' ? "been removed" : "left";
            const goodbyeMsg = `🚫 *GOODBYE*\n@${phoneNumber} has ${reason} the group *${groupMetadata.subject}.*`;
            await sock.sendMessage(id, { text: goodbyeMsg, mentions: [num] });
        }
    });

    // --- MESSAGE PROCESSING ---
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const isBlocked = await runModeration(msg, sock);
        if (isBlocked) return; 
        
        const body = extractText(msg);
        const from = msg.key.remoteJid;

         // ==========================
// ALEXA AUTO REACT FEATURE
// ==========================
if (isAlexaReact(body)) {
    await sock.sendMessage(from, {
        react: {
            text: "🤖",
            key: msg.key
        }
    });
}

// ==========================
// ALEXA ONLINE CHECK
// ==========================
if (isAlexaOnlineQuestion(body)) {
    const replies = [
        "🤖 Yes, I'm online and ready to assist.",
        "✅ I'm here and operating normally.",
        "👋 Yes, I'm active and listening.",
        "⚡ Online and ready for your commands.",
        "🟢 Alexa is currently available."
    ];

    const reply =
        replies[Math.floor(Math.random() * replies.length)];

    await sock.sendMessage(from, {
        text: reply
    });

    return;
}
        
       if (from.endsWith("@g.us")) {

    const userId = msg.key.participant || from;

    groupActivity[from] = {
        timestamp: Date.now(),
        sender: userId
    };

    if (!userActivity[from]) {
        userActivity[from] = {};
    }

    userActivity[from][userId] = {
        lastSeen: Date.now(),
        lastMessageTime: Date.now()
    };
}

        const sendWithTyping = async (text, quotedMsg) => {
            await sock.sendPresenceUpdate('composing', from);
            const delay = Math.floor(Math.random() * 2000) + 3000;
            await new Promise(resolve => setTimeout(resolve, delay));
            await sock.sendMessage(from, { text }, { quoted: quotedMsg });
        };
        
        const mockMsg = {
            body: body,
            from: from,
            author: msg.key.participant || from,
            reply: async (text) => await sendWithTyping(text, msg),
            react: async (emoji) => await sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
        };

        const groupQuiz = activeQuiz[from];
        if (groupQuiz && !groupQuiz.answered && !body.startsWith('!')) {
            const answer = body.trim().toUpperCase();
            if (['A', 'B', 'C', 'D'].includes(answer)) {
                if (answer === groupQuiz.answer) {
                    groupQuiz.answered = true;
                    scores[mockMsg.author] = (scores[mockMsg.author] || 0) + 1;
                    saveScores();
                    await mockMsg.reply(`🏆 Correct!\n\n+1 Point\n\nTotal Score: ${scores[mockMsg.author]}`);
                    delete activeQuiz[from];
                } else {
                    await mockMsg.react('❌');
                }
            }
        }

        if (body.startsWith('!')) {
            const parts = body.slice(1).trim().split(/ +/);
            await routeCommand(
    parts[0].toLowerCase(),
    parts.slice(1),
    mockMsg,
    sock,
    "Alexa",
    {
        groupActivity,
        userActivity,
        presenceStore
    }
);
        }
    });
            }

// --- DASHBOARD & API ROUTES ---
const isAuthenticated = (req, res, next) => req.session.isLoggedIn ? next() : res.redirect('/login');
app.set('view engine', 'ejs');

// Add this route to keep the server alive without authentication
app.get('/ping', (req, res) => {
    res.status(200).send('Bot is alive');
});

app.get('/api/logs', isAuthenticated, (req, res) => {
    res.json({ logs: logBuffer });
});


app.get('/login', (req, res) => {
    // Check if there is an error message in the session (optional)
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    if (req.body.password === process.env.ADMIN_PASSWORD) {
        req.session.isLoggedIn = true;
        res.redirect('/');
    } else {
        // Render login page again with an error message
        res.render('login', { error: 'Invalid Password. Please try again.' });
    }
});

app.post('/api/terminate', isAuthenticated, async (req, res) => {
    try {
        // 1. Attempt to log out of WhatsApp properly
        if (sock) {
            await sock.logout().catch(err => console.log("Logout warning:", err.message));
        }

        // 2. Clear local authentication credentials
        if (fs.existsSync('./auth_info')) {
            fs.rmSync('./auth_info', { recursive: true, force: true });
        }

        // 3. Reset the dashboard tracking variable
        saveSession({ pairedNumber: null });

        // 4. Respond to the dashboard
        res.json({ success: true, message: "Session successfully terminated." });
        
        console.log("✅ Bot session terminated by user.");
    } catch (err) {
        console.error("❌ Termination Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/', isAuthenticated, (req, res) => res.render('index', { year: new Date().getFullYear(), contact: "09034159839" }));
app.get('/pair', isAuthenticated, (req, res) => res.render('pairing-page'));
app.get('/broadcast', isAuthenticated, (req, res) => res.render('broadcast-page'));
app.get('/logs', isAuthenticated, (req, res) => res.render('logs-page'));
app.get('/chat', isAuthenticated, (req, res) => res.render('chat-page'));

app.get('/api/pair', isAuthenticated, async (req, res) => {
    const phone = req.query.phone?.replace(/[^0-9]/g, '');
    if (!sock) return res.status(500).json({ error: 'Bot not ready.' });
    if (!phone) return res.status(400).json({ error: 'Invalid phone number.' });
    
    try {
        const code = await sock.requestPairingCode(phone);
        res.json({ pairingCode: code });
    } catch (err) {
        res.status(500).json({ error: 'Pairing failed. Wait 60s and retry.' });
    }
});

app.post('/api/broadcast', isAuthenticated, async (req, res) => {
    try {
        const { target, message } = req.body;
        await sock.sendMessage(target, { text: message });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/chat', isAuthenticated, async (req, res) => {
    const { message } = req.body;
    const mockMsg = {
        body: `!ai ${message}`,
        from: "dashboard",
        reply: (txt) => res.json({ response: txt })
    };
    await routeCommand('ai', [message], mockMsg, sock, "Alexa");
});

setInterval(() => {
    axios.get("https://flexieduconsult-ai-link.onrender.com").catch(() => {});
}, 600000);

// --- START BOT ONLY AFTER SERVER IS READY ---
app.listen(port, () => {
    console.log(`🚀 Dashboard active on port ${port}`);
    startBot();
});
            
