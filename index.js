const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode');
const http = require('http');
const Anthropic = require('@anthropic-ai/sdk');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const MAX_HISTORY = 10;
const PORT = process.env.PORT || 3000;
const OWNER_PHONE = '256702370441@c.us';

const SYSTEM_PROMPT = `You are an expert AI Customer Service Assistant for Glo Med, a premium pharmaceutical and medical distribution company in Uganda. You handle incoming customer queries via WhatsApp professionally and entirely for free.

Business Context:
- Glo Med distributes pharmaceuticals, medical supplies, and OTC products to clinics, pharmacies, and healthcare buyers across Uganda.
- This WhatsApp customer service channel is 100% free for all customers.
- Delivery: 24-48 hours within Kampala, 48-72 hours upcountry Uganda.
- Minimum order for free delivery: UGX 150,000.
- Payment: Mobile Money (MTN/Airtel), Bank Transfer, or Cash on Delivery.
- Contact number: 0702370441

How to handle requests:
- Stock/order check: Ask for their facility name, product names, and quantities needed.
- Quotation request: Ask for product name, strength/formulation, and quantity.
- Delivery inquiry: Share the timelines above and ask for their location.
- Fees inquiry: Reassure them this channel is completely free.
- Unknown stock: Say you will check with the warehouse team and follow up within the hour.

Response Rules:
- Keep responses SHORT and scannable - this is WhatsApp, not email.
- Use emojis sparingly: 📦 orders, 🩺 medical notes, ✅ confirmation, 🚚 delivery, 💊 products.
- Use *bold* for emphasis (WhatsApp markdown).
- Never output code or technical content.
- Always end with a helpful follow-up question or offer.
- Medical disclaimer: If asked for diagnosis or prescription advice, always add: "🩺 Please consult a qualified medical professional for specific diagnoses and prescriptions."
- Strictly decline non-pharmaceutical topics politely.`;

let currentQR = null;
let botStatus = 'starting';

// ── Start web server FIRST so Railway health check passes ──────
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'text/html');

  if (botStatus === 'ready') {
    return res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#e8f5e9">
      <h1 style="color:#2e7d32">✅ Glo Med Bot is LIVE!</h1>
      <p>WhatsApp connected and replying to customers 24/7.</p>
      <p>Number: <strong>0702370441</strong></p>
    </body></html>`);
  }

  if (!currentQR) {
    return res.end(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="5"></head>
    <body style="font-family:sans-serif;text-align:center;padding:40px">
      <h2>⏳ Bot Starting...</h2>
      <p>QR code loading. Refreshing automatically...</p>
    </body></html>`);
  }

  try {
    const qrImage = await qrcode.toDataURL(currentQR, { width: 300, margin: 2 });
    return res.end(`<!DOCTYPE html><html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <meta http-equiv="refresh" content="25">
      <title>Glo Med - Scan QR</title>
    </head><body style="font-family:sans-serif;text-align:center;padding:20px;background:#f5f5f5">
      <h2 style="color:#128C7E">📱 Glo Med WhatsApp Bot</h2>
      <p>Open WhatsApp → <strong>Linked Devices</strong> → <strong>Link a Device</strong></p>
      <img src="${qrImage}" style="width:280px;height:280px;border:4px solid #128C7E;border-radius:12px" />
      <p style="color:#666;font-size:13px">Page auto-refreshes every 25 seconds.</p>
    </body></html>`);
  } catch (e) {
    return res.end('<h2>Error. Please refresh.</h2>');
  }
});

// Start server immediately — before anything else
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Web server running on port ${PORT}`);
  // Start WhatsApp AFTER server is listening
  startWhatsApp();
});

// ── Conversation memory ────────────────────────────────────────
const customerHistories = new Map();
function getHistory(phone) {
  if (!customerHistories.has(phone)) customerHistories.set(phone, []);
  return customerHistories.get(phone);
}
function addToHistory(phone, role, content) {
  const history = getHistory(phone);
  history.push({ role, content });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
}

// ── Anthropic ──────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
async function getAIReply(phone, userMessage) {
  addToHistory(phone, 'user', userMessage);
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: getHistory(phone),
  });
  const reply = response.content[0].text;
  addToHistory(phone, 'assistant', reply);
  return reply;
}

// ── WhatsApp ───────────────────────────────────────────────────
async function startWhatsApp() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected!');

    const store = new MongoStore({ mongoose });

    const client = new Client({
      authStrategy: new RemoteAuth({
        store,
        backupSyncIntervalMs: 300000,
      }),
      puppeteer: {
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
        ],
      },
    });

    client.on('qr', async (qr) => {
      currentQR = qr;
      botStatus = 'waiting';
      console.log('📱 QR ready! Open your Railway URL to scan.');
    });

    client.on('ready', () => {
      botStatus = 'ready';
      currentQR = null;
      console.log('✅ Glo Med Bot LIVE! Session saved to MongoDB.');
    });

    client.on('remote_session_saved', () => {
      console.log('💾 Session saved to MongoDB.');
    });

    client.on('disconnected', () => {
      console.log('⚠️ Disconnected. Reconnecting in 5s...');
      botStatus = 'starting';
      setTimeout(() => client.initialize(), 5000);
    });

    client.on('message', async (message) => {
      if (message.isGroupMsg || message.from === 'status@broadcast' || message.fromMe) return;
      if (message.from === OWNER_PHONE) return;
      const text = message.body?.trim();
      if (!text) return;

      console.log(`📨 From ${message.from}: ${text}`);

      try {
        const reply = await getAIReply(message.from, text);
        await message.reply(reply);
        console.log('✅ Replied');
      } catch (error) {
        console.error('❌ Error:', error.message);
        await message.reply("⚠️ Brief issue. Please try again or call *0702370441*. 🙏");
      }
    });

    console.log('🚀 Starting WhatsApp...');
    client.initialize();

  } catch (err) {
    console.error('❌ Startup error:', err.message);
    setTimeout(startWhatsApp, 10000);
  }
}
