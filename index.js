const { Client, LocalAuth } = require('whatsapp-web.js'); // Changed to LocalAuth
const admin = require('firebase-admin');
const express = require('express');
const session = require('express-session');
const { routeCommand } = require('./commandRouter');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'alexa-secret-key',
    resave: false,
    saveUninitialized: true
}));

const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Implementation of LocalAuth for stable session management
const client = new Client({
    authStrategy: new LocalAuth({ 
        dataPath: '.wwebjs_auth' 
    }),
    puppeteer: { 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1014164801.html',
        }
});
// Auth Middleware
const isAuthenticated = (req, res, next) => {
    if (req.session.isLoggedIn) next();
    else res.redirect('/login');
};

// Routes
app.set('view engine', 'ejs');
app.use(express.static('public'));

app.get('/login', (req, res) => res.render('login'));
app.post('/login', (req, res) => {
    if (req.body.password === process.env.ADMIN_PASSWORD) {
        req.session.isLoggedIn = true;
        res.redirect('/');
    } else {
        res.status(401).send('Invalid Password');
    }
});

// Protected Dashboard Views
app.get('/', isAuthenticated, (req, res) => res.render('index', { year: new Date().getFullYear(), contact: "09034159839" }));
app.get('/pair', isAuthenticated, (req, res) => res.render('pairing-page'));
app.get('/broadcast', isAuthenticated, (req, res) => res.render('broadcast-page'));
app.get('/logs', isAuthenticated, (req, res) => res.render('logs-page'));
app.get('/chat', isAuthenticated, (req, res) => res.render('chat-page'));

// API Endpoints
app.get('/api/pair', isAuthenticated, async (req, res) => {
    const code = await client.requestPairingCode(req.query.phone);
    res.json({ pairingCode: code });
});

app.post('/api/broadcast', isAuthenticated, async (req, res) => {
    const { target, message } = req.body;
    await client.sendMessage(target, message);
    res.json({ success: true });
});

app.post('/api/chat', isAuthenticated, async (req, res) => {
    const { message } = req.body;
    // Mocking the message object so the bot thinks it came from WhatsApp
    const mockMsg = {
        body: `!ai ${message}`,
        reply: (txt) => res.json({ response: txt }),
        getChat: async () => ({ sendStateTyping: () => {} })
    };
    await routeCommand('ai', [message], mockMsg);
});

// Bot Logic
client.on('message', async (msg) => {
    if (msg.body.startsWith('!')) {
        const parts = msg.body.slice(1).trim().split(/ +/);
        await routeCommand(parts[0].toLowerCase(), parts.slice(1), msg);
    }
});

client.initialize();
app.listen(port, () => console.log(`Dashboard active on port ${port}`));
        
