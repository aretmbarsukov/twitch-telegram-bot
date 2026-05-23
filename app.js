import express from "express";
import axios from "axios";

const app = express();
app.use(express.json({ type: "*/*" }));

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
  console.log("Twitch token received");
}

async function subscribeToStream(streamer) {
  const res = await axios.post(
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

  console.log("Subscribed to stream:", streamer);
  console.log(res.data);
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

app.listen(process.env.PORT || 3000, async () => {
  console.log("Bot running on Render");
  await getTwitchToken();

  await subscribeToStream("steel");
  await subscribeToStream("ravshann");
  await subscribeToStream("renatko");
  await subscribeToStream("bratishkinoff");
  await subscribeToStream("steelaaga");
  await subscribeToStream("ravshanbtw");
  await subscribeToStream("anarabdullaev");

  console.log("All subscriptions created");
});
