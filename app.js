import express from "express";
import axios from "axios";

const app = express();
app.use(express.json({ type: "*/*" }));

process.on("uncaughtException", err => console.log("UNCAUGHT:", err));
process.on("unhandledRejection", err => console.log("UNHANDLED:", err));

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET = process.env.TWITCH_SECRET;

let accessToken = null;

const streamers = [
  "steel",
  "ravshann",
  "renatko",
  "steelaaga",
  "ravshanbtw",
  "anarabdullaev",
  "kerimch1k",
  "renatkobmw",
  "blslan",
  "tadzheek",
  "dedadam",
  "vitollo_13",
  "ereek",
  "dankzlv"
];

let lastMessages = {};
let onlineStatus = {};

async function getTwitchToken() {
  try {
    const res = await axios.post(
      `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_SECRET}&grant_type=client_credentials`
    );
    accessToken = res.data.access_token;
    console.log("Twitch token обновлён");
  } catch (err) {
    console.log("Ошибка получения токена:", err);
  }
}

async function checkStreamer(streamer) {
  try {
    const res = await axios.get(
      `https://api.twitch.tv/helix/streams?user_login=${streamer}`,
      {
        headers: {
          "Client-ID": TWITCH_CLIENT_ID,
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
    return res.data.data.length > 0 ? res.data.data[0] : null;
  } catch (err) {
    console.log("API error:", err);
    return null;
  }
}

async function checkStreams() {
  if (!accessToken) return;
  console.log("🔍 Перевірка стримерів:", new Date().toLocaleTimeString("uk-UA"));

  for (const streamer of streamers) {
    const stream = await checkStreamer(streamer);

    // 🟢 ОНЛАЙН
    if (stream) {
      if (!onlineStatus[streamer]) {
        const title = stream.title || "Без названия";
        const category = stream.game_name || "Без категории";
        const text =
          `🟢 *${stream.user_login}*\n` +
          `🎮 Категория: *${category}*\n` +
          `📝 Название: ${title}\n` +
          `🔗 https://twitch.tv/${stream.user_login}`;

        const msg = await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
          { chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "Markdown" }
        );
        lastMessages[streamer] = msg.data.result.message_id;
        onlineStatus[streamer] = true;
        console.log("ONLINE:", streamer);
      }
    }

    // 🔴 ОФФЛАЙН
    else {
      if (onlineStatus[streamer]) {
        if (lastMessages[streamer]) {
          await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteMessage`,
            { chat_id: TELEGRAM_CHAT_ID, message_id: lastMessages[streamer] }
          );
          lastMessages[streamer] = null;
        }
        onlineStatus[streamer] = false;
        console.log("OFFLINE:", streamer);
      }
    }
  }
}


app.get("/", (req, res) => {
  res.send("Bot is running");
});

app.listen(process.env.PORT || 3000, async () => {
  await getTwitchToken();
  setInterval(getTwitchToken, 3 * 60 * 60 * 1000);
  setInterval(checkStreams, 10 * 60 * 1000); // кожні 10 хвилин
  checkStreams(); // перша перевірка одразу при старті
  console.log("Bot started");
});
