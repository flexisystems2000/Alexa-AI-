const { Client, RemoteAuth } = require('whatsapp-web.js');
const admin = require('firebase-admin');
const express = require('express');
const { routeCommand } = require('./commandRouter');

// Initialize Express
const app = express();
const port = process.env.PORT || 3000;

// Initialize Firebase (Ensure FIREBASE_CONFIG env var is set)
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// 1. WhatsApp Client Setup
const client = new Client({
    authStrategy: new RemoteAuth({ 
        store: new (require('wwebjs-firestore'))({ db: db }),
        backupSyncIntervalMs: 300000 
    }),
    // Pairing code setup
    pairWithPhoneNumber: true,
    // Essential for cloud stability
    puppeteer: { 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    },
    // Browser identity to mimic a real desktop device
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1014164801.html',
    }
});

// 2. Event Listeners
client.on('ready', () => console.log('Alexa AI is ready and connected!'));

client.on('message', async (msg) => {
    // This is the core 'message' event, equivalent to how you process 
    // incoming traffic in whatsapp-web.js
    if (msg.body.startsWith('!')) {
        const parts = msg.body.slice(1).trim().split(/ +/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);
        
        // Pass to your central command router
        await routeCommand(command, args, msg);
    }
});

client.initialize();

// 3. Web Dashboard (Express)
app.set('view engine', 'ejs');
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.render('index', { 
        year: new Date().getFullYear(), 
        contact: "09034159839" 
    });
});

// Endpoint to trigger pairing code via web
app.get('/api/pair', async (req, res) => {
    const phoneNumber = req.query.phone;
    if (!phoneNumber) return res.status(400).send('Phone number required');
    
    const code = await client.requestPairingCode(phoneNumber);
    res.json({ pairingCode: code });
});

app.listen(port, () => console.log(`Dashboard running on port ${port}`));
