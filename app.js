import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET = process.env.TWITCH_SECRET;
const CALLBACK_URL = process.env.CALLBACK_URL;

let accessToken = null;

async function getTwitchToken() {
  const res = await axios.post(
    `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_SECRET}&grant_type=client_credentials`
  );
  accessToken = res.data.access_token;
}

async function subscribeToStream(streamer) {
  await axios.post(
    "https://api.twitch.tv/helix/eventsub/subscriptions",
    {
      type: "stream.online",
      version: "1",
      condition: { broadcaster_user_login: streamer },
      transport: {
        method: "webhook",
        callback: `${CALLBACK_URL}/twitch`,
        secret: "mysecret123"
      }
    },
    {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    }
  );
}

app.post("/twitch", async (req, res) => {
  const messageType = req.headers["twitch-eventsub-message-type"];

  if (messageType === "webhook_callback_verification") {
    return res.send(req.body.challenge);
  }

  if (messageType === "notification") {
    const streamer = req.body.event.broadcaster_user_name;

    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: `🔴 ${streamer} запустив стрім на Twitch!`
      }
    );
  }

  res.sendStatus(200);
});

app.listen(3000, async () => {
  console.log("Bot running");
  await getTwitchToken();
  await subscribeToStream("ІМЯ_СТРІМЕРА"); // ← заміни на стрімера
});
