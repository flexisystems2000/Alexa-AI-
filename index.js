const { Client, LocalAuth } = require('whatsapp-web.js');
const admin = require('firebase-admin');
const express = require('express');
const session = require('express-session');

const {
    routeCommand,
    activeQuiz,
    scores,
    saveScores
} = require('./commandRouter');

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

// Firebase Initialization
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// =====================================================
// WHATSAPP CLIENT CONFIGURATION
// =====================================================

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: '.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ]
    },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1014164801.html'
    }
});

// =====================================================
// AUTHENTICATION MIDDLEWARE
// =====================================================

const isAuthenticated = (req, res, next) => {
    if (req.session.isLoggedIn) {
        return next();
    }
    res.redirect('/login');
};

app.set('view engine', 'ejs');

// =====================================================
// AUTH ROUTES
// =====================================================

app.get('/login', (req, res) => res.render('login'));

app.post('/login', (req, res) => {
    if (req.body.password === process.env.ADMIN_PASSWORD) {
        req.session.isLoggedIn = true;
        res.redirect('/');
    } else {
        res.status(401).send('Invalid Password');
    }
});

// =====================================================
// DASHBOARD ROUTES
// =====================================================

app.get('/', isAuthenticated, (req, res) => 
    res.render('index', { 
        year: new Date().getFullYear(), 
        contact: "09034159839" 
    })
);

app.get('/pair', isAuthenticated, (req, res) => res.render('pairing-page'));
app.get('/broadcast', isAuthenticated, (req, res) => res.render('broadcast-page'));
app.get('/logs', isAuthenticated, (req, res) => res.render('logs-page'));
app.get('/chat', isAuthenticated, (req, res) => res.render('chat-page'));

// =====================================================
// API ROUTES
// =====================================================

// API: Pair (Robust Version)
app.get('/api/pair', isAuthenticated, async (req, res) => {
    const phone = req.query.phone;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    try {
        console.log(`Attempting pairing for: ${phone}`);
        const code = await client.requestPairingCode(phone);
        res.json({ pairingCode: code });
    } catch (err) {
        console.error("API Pairing Error:", err);
        res.status(500).json({ error: 'Pairing failed. Ensure client is ready.' });
    }
});

// API: Broadcast
app.post('/api/broadcast', isAuthenticated, async (req, res) => {
    try {
        const { target, message } = req.body;
        await client.sendMessage(target, message);
        res.json({ success: true });
    } catch (err) {
        console.error("Broadcast Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Chat (Bridging to Alexa Personality)
app.post('/api/chat', isAuthenticated, async (req, res) => {
    const { message } = req.body;

    const mockMsg = {
        body: `!ai ${message}`,
        reply: (txt) => res.json({ response: txt }),
        getChat: async () => ({ sendStateTyping: () => {} })
    };

    // Passing "Alexa" to ensure the AI knows which personality to use
    await routeCommand('ai', [message], mockMsg, client, "Alexa");
});

// =====================================================
// WHATSAPP MESSAGE HANDLING
// =====================================================

client.on('message', async (msg) => {
    if (!msg.body) return;

    // Quiz System
    const groupQuiz = activeQuiz[msg.from];
    if (groupQuiz && !groupQuiz.answered && !msg.body.startsWith('!')) {
        const answer = msg.body.trim().toUpperCase();
        if (['A', 'B', 'C', 'D'].includes(answer)) {
            if (answer === groupQuiz.answer) {
                groupQuiz.answered = true;
                const user = msg.author || msg.from;
                scores[user] = (scores[user] || 0) + 1;
                saveScores();
                await msg.reply(`🏆 Correct!\n\n+1 Point\n\nTotal Score: ${scores[user]}`);
                delete activeQuiz[msg.from];
                return;
            } else {
                await msg.react('❌');
                return;
            }
        }
    }

    // Command Handler
    if (msg.body.startsWith('!')) {
        const parts = msg.body.slice(1).trim().split(/ +/);
        await routeCommand(parts[0].toLowerCase(), parts.slice(1), msg, client, "Alexa");
    }
});

// =====================================================
// CLIENT LIFECYCLE EVENTS
// =====================================================

client.on('ready', () => console.log('✅ WhatsApp Client Ready'));
client.on('authenticated', () => console.log('🔐 Authenticated'));
client.on('auth_failure', (msg) => console.error('❌ Auth Failure:', msg));
client.on('disconnected', (reason) => console.log('⚠️ Disconnected:', reason));

process.on('unhandledRejection', (err) => console.error('Unhandled Rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));

client.initialize();

app.listen(port, () => console.log(`🚀 Dashboard active on port ${port}`));
        
