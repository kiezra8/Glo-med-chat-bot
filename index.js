const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const http = require('http');
const Anthropic = require('@anthropic-ai/sdk');

// ── Configuration ──────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MAX_HISTORY = 10;
const PORT = process.env.PORT || 3000;

// Your phone number — bot stays silent when you text yourself
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
- Quotation request: Ask for product name, strength/formulation, and quantity. Then confirm you will send a formal quote shortly.
- Delivery inquiry: Share the timelines above and ask for their location.
- Fees inquiry: Reassure them this channel is completely free.
- Unknown stock: Say you will check with the warehouse team and follow up within the hour.

Response Rules:
- Keep responses SHORT and scannable - this is WhatsApp, not email.
- Use emojis sparingly: 📦 orders, 🩺 medical notes, ✅ confirmation, 🚚 delivery, 💊 products.
- Use *bold* for emphasis (WhatsApp markdown).
- Never output code, JSON, or technical content.
- Always end with a helpful follow-up question or offer.
- Medical disclaimer: If asked for diagnosis or prescription advice, provide general info and always add: "🩺 Please consult a qualified medical professional for specific diagnoses and prescriptions."
- Strictly decline non-pharmaceutical topics politely.`;

// ── QR code web page ───────────────────────────────────────────
let currentQR = null;
let botStatus = 'waiting'; // waiting | ready

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'text/html');

  if (botStatus === 'ready') {
    res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#e8f5e9">
      <h1 style="color:#2e7d32">✅ Glo Med Bot is LIVE!</h1>
      <p style="font-size:18px">WhatsApp is connected and responding to customers.</p>
      <p>Number: <strong>0702370441</strong></p>
    </body></html>`);
    return;
  }

  if (!currentQR) {
    res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px">
      <h2>⏳ Glo Med Bot Starting...</h2>
      <p>QR code is loading. Please refresh this page in 15 seconds.</p>
      <script>setTimeout(()=>location.reload(), 8000)</script>
    </body></html>`);
    return;
  }

  try {
    const qrImage = await qrcode.toDataURL(currentQR, { width: 300, margin: 2 });
    res.end(`<!DOCTYPE html><html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Glo Med - Scan QR</title>
    </head><body style="font-family:sans-serif;text-align:center;padding:20px;background:#f5f5f5">
      <h2 style="color:#128C7E">📱 Glo Med WhatsApp Bot</h2>
      <p>Open WhatsApp → <strong>Linked Devices</strong> → <strong>Link a Device</strong><br>then scan this QR code:</p>
      <img src="${qrImage}" style="width:280px;height:280px;border:4px solid #128C7E;border-radius:12px" />
      <p style="color:#666;font-size:13px">QR code expires in 60 seconds. Page refreshes automatically.</p>
      <script>setTimeout(()=>location.reload(), 30000)</script>
    </body></html>`);
  } catch (e) {
    res.end('<h2>Error generating QR. Please refresh.</h2>');
  }
});

server.listen(PORT, () => {
  console.log(`🌐 QR page running on port ${PORT}`);
  console.log(`👉 Open your Railway public URL to scan the QR code`);
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

// ── Anthropic client ───────────────────────────────────────────
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

// ── WhatsApp client ────────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './session' }),
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

client.on('qr', (qr) => {
  currentQR = qr;
  botStatus = 'waiting';
  console.log('📱 QR code ready! Open your Railway public URL in a browser to scan it.');
});

client.on('ready', () => {
  botStatus = 'ready';
  currentQR = null;
  console.log('✅ Glo Med WhatsApp Bot is LIVE and ready to receive messages!');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Authentication failed:', msg);
});

client.on('disconnected', (reason) => {
  console.log('⚠️ Bot disconnected:', reason);
  botStatus = 'waiting';
  client.initialize();
});

client.on('message', async (message) => {
  if (message.isGroupMsg || message.from === 'status@broadcast' || message.fromMe) return;

  const phone = message.from;
  if (phone === OWNER_PHONE) {
    console.log('👤 [OWNER] Your own message — bot is silent.');
    return;
  }

  const text = message.body?.trim();
  if (!text) return;

  console.log(`📨 [${new Date().toLocaleTimeString()}] From ${phone}: ${text}`);

  const chat = await message.getChat();
  await chat.sendStateTyping();

  try {
    const reply = await getAIReply(phone, text);
    await message.reply(reply);
    console.log(`✅ Replied to ${phone}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await message.reply(
      "⚠️ Sorry, I'm having a brief technical issue. Please try again or call *0702370441* directly. Thank you! 🙏"
    );
  }
});

// ── Start ──────────────────────────────────────────────────────
console.log('🚀 Starting Glo Med WhatsApp Bot...');
client.initialize();
