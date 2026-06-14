const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode');
const http = require('http');
const Anthropic = require('@anthropic-ai/sdk');

const PORT = process.env.PORT || 3000;
const OWNER = '256702370441@c.us';
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

let QR = null, status = 'starting';
const histories = new Map();

const PROMPT = 'You are a WhatsApp customer service assistant for Glo Med, a pharmaceutical distributor in Uganda. Be professional and concise. Delivery: 24-48hrs Kampala, 48-72hrs upcountry. Min order UGX 150,000 for free delivery. Payment: MTN/Airtel Money, bank transfer, or cash. For stock checks ask for facility name, product and quantity. For medical advice always add: Please consult a qualified doctor. Decline non-pharma topics politely.';

http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  if (status === 'ready') return res.end('<html><body style="text-align:center;padding:40px;background:#e8f5e9"><h1>Glo Med Bot LIVE!</h1><p>Replying to customers 24/7</p></body></html>');
  if (!QR) return res.end('<html><head><meta http-equiv="refresh" content="5"></head><body style="text-align:center;padding:40px"><h2>Starting... please wait</h2></body></html>');
  const img = await qrcode.toDataURL(QR, { width: 300 });
  res.end('<html><head><meta http-equiv="refresh" content="25"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="text-align:center;padding:20px"><h2>Scan with WhatsApp</h2><p>Linked Devices - Link a Device</p><img src="' + img + '" style="width:280px;border:4px solid green;border-radius:10px"><p>Refreshes every 25 seconds</p></body></html>');
}).listen(PORT, '0.0.0.0', () => {
  console.log('Server on port ' + PORT);
  init();
});

async function init() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');
  const store = new MongoStore({ mongoose });
  const client = new Client({
    authStrategy: new RemoteAuth({ store, backupSyncIntervalMs: 300000 }),
    puppeteer: { args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--disable-gpu'] }
  });
  client.on('qr', qr => { QR = qr; status = 'waiting'; console.log('QR ready - open Railway URL'); });
  client.on('ready', () => { status = 'ready'; QR = null; console.log('BOT LIVE!'); });
  client.on('disconnected', () => { status = 'starting'; setTimeout(() => client.initialize(), 5000); });
  client.on('message', async msg => {
    if (msg.isGroupMsg || msg.fromMe || msg.from === 'status@broadcast' || msg.from === OWNER) return;
    const text = msg.body && msg.body.trim();
    if (!text) return;
    console.log('MSG: ' + text);
    if (!histories.has(msg.from)) histories.set(msg.from, []);
    const h = histories.get(msg.from);
    h.push({ role: 'user', content: text });
    if (h.length > 10) h.shift();
    try {
      const r = await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 512, system: PROMPT, messages: h });
      const reply = r.content[0].text;
      h.push({ role: 'assistant', content: reply });
      await msg.reply(reply);
    } catch (e) {
      await msg.reply('Sorry, brief issue. Please call 0702370441.');
    }
  });
  client.initialize();
        }
