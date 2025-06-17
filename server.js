const express = require('express');
const { TwitterApi } = require('twitter-api-v2');
const axios = require('axios');
const app = express();
app.use(express.json());

const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

const rwClient = client.readWrite;

const generateMemeReply = async (tweetText) => {
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'Du bist ein lustiger Meme-Bot, der mit kurzen, witzigen Kommentaren auf Tweets antwortet.' },
        { role: 'user', content: `Antworte in Meme-Sprache auf diesen Tweet: "${tweetText}"` }
      ],
      max_tokens: 60
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].message.content.trim();
  } catch (err) {
    console.error('GPT-Fehler:', err.message);
    return '🐸💬 Oops! Meme verloren im Koiverse...';
  }
};

app.post('/tweet-reply', async (req, res) => {
  const tweetUrl = req.body.url;
  const tweetId = tweetUrl?.split('/').pop();

  if (!tweetId) return res.status(400).send('Ungültige Tweet-URL');

  try {
    const tweet = await rwClient.v2.singleTweet(tweetId, { expansions: ['author_id'], 'tweet.fields': ['text'] });
    const tweetText = tweet?.data?.text || '';

    const replyText = await generateMemeReply(tweetText);
    await rwClient.v2.reply(replyText, tweetId);

    res.status(200).send('Antwort gesendet');
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Antworten');
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Bot ist live auf Port ${port}`));
