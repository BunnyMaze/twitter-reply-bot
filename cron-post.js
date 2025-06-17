// cron-post.js
import https from 'https';
import { TwitterApi } from 'twitter-api-v2';

// Twitter Bot Client mit Render-Umgebungsvariablen
const rwClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

// RapidAPI Top Tweet holen
async function getTopCryptoTweet() {
  return new Promise((resolve, reject) => {
    const options = {
      method: "GET",
      hostname: "twitter241.p.rapidapi.com",
      path: "/search-v2?type=Top&count=1&query=crypto",
      headers: {
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
        "x-rapidapi-host": "twitter241.p.rapidapi.com"
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const tweet = json?.data?.[0];
          if (!tweet) return reject("No tweet found.");
          const text = tweet.text;
          const username = tweet.user.screen_name;
          const tweetId = tweet.id_str;
          const url = `https://twitter.com/${username}/status/${tweetId}`;
          resolve(`${text}\n\n🔗 ${url}`);
        } catch (e) {
          reject("Error parsing response: " + e);
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

// Hauptfunktion
async function run() {
  try {
    const tweetText = await getTopCryptoTweet();
    const result = await rwClient.v2.tweet(tweetText);
    console.log("Tweet sent:", result);
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
