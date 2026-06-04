import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import fs from "fs";

// === ENV ===
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET = process.env.TWITCH_SECRET;
const CHANNEL_NAME = process.env.CHANNEL_NAME;

// === STATE ===
let state = {};
if (fs.existsSync("state.json")) {
  state = JSON.parse(fs.readFileSync("state.json", "utf8"));
}

// === TELEGRAM ===
async function sendMessage(text) {
  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
      }
    );
  } catch (err) {
    console.log("Telegram error:", err.response?.data || err.message);
  }
}

async function sendFatal(text) {
  await sendMessage(`🚨 <b>Бот впав:</b>\n${text}`);
}

// === TWITCH AUTH ===
async function getTwitchToken() {
  const res = await axios.post(
    `https://id.twitch.tv/oauth2/token`,
    null,
    {
      params: {
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_SECRET,
        grant_type: "client_credentials",
      },
    }
  );
  return res.data.access_token;
}

// === CHECK STREAM ===
async function checkStream(token) {
  const res = await axios.get(
    `https://api.twitch.tv/helix/streams?user_login=${CHANNEL_NAME}`,
    {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return res.data.data.length > 0 ? res.data.data[0] : null;
}

// === MAIN ===
async function main() {
  console.log("▶ Старт перевірки…");

  const token = await getTwitchToken();
  console.log("✔ Twitch токен отримано");

  const stream = await checkStream(token);

  if (stream) {
    console.log("🔴 Стрімер онлайн:", stream.title);

    if (!state.live) {
      await sendMessage(
        `🔴 <b>${CHANNEL_NAME}</b> зараз онлайн!\n\n<b>${stream.title}</b>\nhttps://twitch.tv/${CHANNEL_NAME}`
      );
      state.live = true;
      fs.writeFileSync("state.json", JSON.stringify(state, null, 2));
    }
  } else {
    console.log("⚪ Стрімер офлайн");

    if (state.live) {
      await sendMessage(`⚪ <b>${CHANNEL_NAME}</b> пішов офлайн`);
      state.live = false;
      fs.writeFileSync("state.json", JSON.stringify(state, null, 2));
    }
  }
}

// === LOOP (для Termux) ===
async function loop() {
  while (true) {
    try {
      await main();
    } catch (err) {
      await sendFatal(err.message);
    }
    await new Promise((res) => setTimeout(res, 60000)); // 60 сек
  }
}

// Якщо запускається в Termux — працює нескінченно
// Якщо запускається в GitHub Actions — виконує один цикл і завершується
if (process.env.GITHUB_ACTIONS) {
  main();
} else {
  loop();
}
