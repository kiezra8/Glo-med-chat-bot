const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Anthropic = require('@anthropic-ai/sdk');

// ── Configuration ──────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MAX_HISTORY = 10; // messages to remember per customer

// Your phone number — the bot will NEVER auto-reply to your own messages
// Format: 256 (Uganda code) + number without leading 0
const OWNER_PHONE = '256702370441@c.us'; // 0702370441

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

// ── Conversation memory (per customer phone number) ────────────
const customerHistories = new Map();

function getHistory(phone) {
  if (!customerHistories.has(phone)) {
    customerHistories.set(phone, []);
  }
  return customerHistories.get(phone);
}

function addToHistory(phone, role, content) {
  const history = getHistory(phone);
  history.push({ role, content });
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

// ── Anthropic client ───────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

async function getAIReply(phone, userMessage) {
  addToHistory(phone, 'user', userMessage);
  const history = getHistory(phone);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: history,
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
  console.log('\n📱 Scan this QR code with your WhatsApp:\n');
  qrcode.generate(qr, { small: true });
  console.log('\nOpen WhatsApp → Settings → Linked Devices → Link a Device\n');
});

client.on('ready', () => {
  console.log('✅ Glo Med WhatsApp Bot is LIVE and ready to receive messages!');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Authentication failed:', msg);
});

client.on('disconnected', (reason) => {
  console.log('⚠️  Bot disconnected:', reason);
  console.log('Attempting to reconnect...');
  client.initialize();
});

client.on('message', async (message) => {
  // Ignore group messages, status updates, and messages from self
  if (message.isGroupMsg || message.from === 'status@broadcast' || message.fromMe) return;

  const phone = message.from;

  // Never auto-reply to your own number — you can still use WhatsApp normally
  if (phone === OWNER_PHONE) {
    console.log('👤 [OWNER] Message from your own number — bot is silent.');
    return;
  }

  const text = message.body?.trim();
  if (!text) return;

  console.log(`📨 [${new Date().toLocaleTimeString()}] From ${phone}: ${text}`);

  // Show "typing..." indicator
  const chat = await message.getChat();
  await chat.sendStateTyping();

  try {
    const reply = await getAIReply(phone, text);
    await message.reply(reply);
    console.log(`✅ Replied to ${phone}`);
  } catch (error) {
    console.error('❌ Error getting AI reply:', error.message);
    await message.reply(
      "⚠️ Sorry, I'm experiencing a brief technical issue. Please try again in a moment, or call us directly on *0702370441* for urgent orders.\n\nThank you for your patience! 🙏"
    );
  }
});

// ── Start ──────────────────────────────────────────────────────
console.log('🚀 Starting Glo Med WhatsApp Bot...');
client.initialize();
