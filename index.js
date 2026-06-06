const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const session = require('express-session');
const admin = require('firebase-admin');

const { routeCommand, activeQuiz, scores, saveScores } = require('./commandRouter');

const app = express();
const port = process.env.PORT || 3000;

// =====================================================
// MIDDLEWARE & CONFIG
// =====================================================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'alexa-secret-key',
    resave: false,
    saveUninitialized: true
}));

const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

let sock;

const extractText = (msg) => {
    return msg.message?.conversation || 
           msg.message?.extendedTextMessage?.text || 
           msg.message?.imageMessage?.caption || "";
};

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');

    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['Alexa AI', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ Baileys Client Ready');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const body = extractText(msg);
        const from = msg.key.remoteJid;

        const mockMsg = {
            body: body,
            from: from,
            author: msg.key.participant || from,
            reply: async (text) => await sock.sendMessage(from, { text }, { quoted: msg }),
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
            await routeCommand(parts[0].toLowerCase(), parts.slice(1), mockMsg, sock, "Alexa");
        }
    });
}

// =====================================================
// DASHBOARD & API ROUTES
// =====================================================
const isAuthenticated = (req, res, next) => req.session.isLoggedIn ? next() : res.redirect('/login');
app.set('view engine', 'ejs');

app.get('/login', (req, res) => res.render('login'));
app.post('/login', (req, res) => {
    if (req.body.password === process.env.ADMIN_PASSWORD) {
        req.session.isLoggedIn = true;
        res.redirect('/');
    } else res.status(401).send('Invalid Password');
});

app.get('/', isAuthenticated, (req, res) => res.render('index', { year: new Date().getFullYear(), contact: "09034159839" }));
app.get('/pair', isAuthenticated, (req, res) => res.render('pairing-page'));
app.get('/broadcast', isAuthenticated, (req, res) => res.render('broadcast-page'));
app.get('/logs', isAuthenticated, (req, res) => res.render('logs-page'));
app.get('/chat', isAuthenticated, (req, res) => res.render('chat-page'));

app.get('/api/pair', isAuthenticated, async (req, res) => {
    try {
        const code = await sock.requestPairingCode(req.query.phone);
        res.json({ pairingCode: code });
    } catch (err) {
        res.status(500).json({ error: 'Pairing failed.' });
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

startBot();
app.listen(port, () => console.log(`🚀 Dashboard active on port ${port}`));
         
