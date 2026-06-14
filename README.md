# MediServe WhatsApp AI Bot — Setup Guide

This bot connects your WhatsApp number to Claude AI so customers get instant, professional replies 24/7 — for free.

---

## What You Need (All Free)

| Tool | Purpose | Cost |
|------|---------|------|
| GitHub account | Store your code | Free |
| Railway.app account | Run the bot 24/7 | Free (500 hrs/month) |
| Anthropic API key | Power the AI | ~$0.003/conversation |
| Your WhatsApp number | Customer channel | Free |

---

## STEP 1 — Get Your Anthropic API Key

1. Go to **https://console.anthropic.com**
2. Sign up with your email
3. Click **"API Keys"** in the left menu
4. Click **"Create Key"** → copy and save it somewhere safe
5. Add a small credit (minimum $5) — this will last hundreds of conversations

---

## STEP 2 — Put the Code on GitHub

1. Go to **https://github.com** and sign in (or create a free account)
2. Click the **"+"** button → **"New repository"**
3. Name it: `mediserve-whatsapp-bot`
4. Set it to **Private**
5. Click **"Create repository"**
6. On the next page, click **"uploading an existing file"**
7. Upload ALL these files:
   - `index.js`
   - `package.json`
   - `railway.toml`
   - `nixpacks.toml`
   - `.gitignore`
8. Click **"Commit changes"**

---

## STEP 3 — Deploy on Railway

1. Go to **https://railway.app** and sign up with your GitHub account
2. Click **"New Project"**
3. Choose **"Deploy from GitHub repo"**
4. Select your `mediserve-whatsapp-bot` repo
5. Railway will detect the config automatically — click **"Deploy"**
6. Once deployed, go to your project → click **"Variables"** tab
7. Add this variable:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** your API key from Step 1
8. Click **"Add"** — Railway will restart the bot automatically

---

## STEP 4 — Scan the QR Code (Link Your WhatsApp)

1. In Railway, click your service → click **"View Logs"**
2. Wait about 60 seconds for it to start
3. You'll see a QR code printed in the logs
4. On your phone: open **WhatsApp → Settings → Linked Devices → Link a Device**
5. Scan the QR code
6. You'll see: `✅ MediServe WhatsApp Bot is LIVE!`

**That's it! Your bot is running.**

---

## Testing It

Send a WhatsApp message to your own number from another phone:

- *"Do you have Amoxicillin 500mg in stock?"*
- *"What are your delivery charges?"*
- *"Is this service free?"*
- *"I need a quote for IV fluids"*

The bot will reply within seconds.

---

## Important Notes

- **Session:** The bot stays linked to your WhatsApp like a normal linked device. If Railway restarts, it reconnects automatically without needing to scan QR again.
- **Groups:** The bot ignores group chats — only responds to direct messages.
- **Your phone:** You can still use WhatsApp normally on your phone. The bot runs in the background.
- **Costs:** Railway free tier = 500 hours/month (enough for ~20 days). To run 24/7, upgrade Railway ($5/month) OR use their free hobby plan which includes 500hrs.

---

## Customising the Bot

To change what the bot says or knows, open `index.js` and edit the `SYSTEM_PROMPT` section near the top. You can update:
- Your business name
- Delivery timelines
- Minimum order amounts
- Payment methods
- Product categories

After editing, push the changes to GitHub — Railway will redeploy automatically.

---

## Need Help?

If you get stuck on any step, reach out. Common issues:
- **QR not appearing:** Wait 2 minutes, check logs again
- **Bot not replying:** Check that `ANTHROPIC_API_KEY` variable is set correctly in Railway
- **Session expired:** Scan QR code again from the logs
