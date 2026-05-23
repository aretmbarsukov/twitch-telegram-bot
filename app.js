import express from "express";
import axios from "axios";

const app = express();
app.use(express.json({ type: "*/*" }));

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET = process.env.TWITCH_SECRET;

let accessToken = null;

const streamers = [
  "steel",
  "ravshann",
  "renatko",
  "bratishkinoff",
  "steelaaga",
  "ravshanbtw",
  "anarabdullaev",
  "KERIMCH1K"
];

let streamInfo = {};

async function getTwitchToken() {
  try {
    const res = await axios.post(
      `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_SECRET}&grant_type=client_credentials`
    );
    accessToken = res.data.access_token;
  } catch (err) {}
}

async function checkStreams() {
  if (!accessToken) return;

  for (const streamer of streamers) {
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

      const isOnline = res.data.data.length > 0;

      if (isOnline) {
        const title = res.data.data[0].title;
        const url = `https://twitch.tv/${streamer}`;
        const text = `🟢 ${streamer}\n${title}\n${url}`;

        if (!streamInfo[streamer]) {
          const msg = await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
            {
              chat_id: TELEGRAM_CHAT_ID,
              text: text
            }
          );

          streamInfo[streamer] = {
            messageId: msg.data.result.message_id,
            title: title,
            online: true
          };
        } else {
          if (streamInfo[streamer].title !== title) {
            const msg = await axios.post(
              `https://api.telegram.org/bot${TELEGRAM_TOKEN}/editMessageText`,
              {
                chat_id: TELEGRAM_CHAT_ID,
                message_id: streamInfo[streamer].messageId,
                text: text
              }
            );

            streamInfo[streamer].title = title;
          }
        }
      } else {
        if (streamInfo[streamer] && streamInfo[streamer].online) {
          const old = streamInfo[streamer];

          const offlineText =
            `🔴 ${streamer}\nСТРИМ ЗАКОНЧИЛСЯ\n🔴`;

          await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/editMessageText`,
            {
              chat_id: TELEGRAM_CHAT_ID,
              message_id: old.messageId,
              text: offlineText
            }
          );

          streamInfo[streamer].online = false;
        }
      }
    } catch (err) {}
  }
}

app.get("/", (req, res) => {
  res.send("Bot is running");
});

app.listen(process.env.PORT || 3000, async () => {
  await getTwitchToken();
  setInterval(getTwitchToken, 3 * 60 * 60 * 1000);
  setInterval(checkStreams, 30 * 1000);
});
