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

const imageUrls = process.env.IMAGE_URLS ? process.env.IMAGE_URLS.split(',') : [];

const getRandomImageUrl = () => {
  if (imageUrls.length === 0) return null;
  const idx = Math.floor(Math.random() * imageUrls.length);
  return imageUrls[idx].trim();
};

const uploadImageFromUrl = async (url) => {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const mediaId = await rwClient.v1.uploadMedia(Buffer.from(response.data), { mimeType: 'image/jpeg' });
    return mediaId;
  } catch (err) {
    console.error('Fehler beim Hochladen des Bildes:', err.message);
    return null;
  }
};

const generateMemeReply = async (tweetText) => {
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Du bist ein kreativer, witziger Meme-Bot, der auf Tweets eingeht und dabei immer den Crypto Token $KOII und den Twitter Account @KoiiFoundation erwähnt. Deine Antwort darf maximal 250 Zeichen lang sein und soll Interesse wecken.'
        },
        {
          role: 'user',
          content: `Antworte auf diesen Tweet: "${tweetText}". Erwähne unbedingt $KOII und @KoiiFoundation. Halte die Antwort humorvoll und einladend.`
        }
      ],
      max_tokens: 120
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    let reply = response.data.choices[0].message.content.trim();
    if (reply.length > 250) {
      reply = reply.slice(0, 247) + '...';
    }
    return reply;
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

    const imageUrl = getRandomImageUrl();
    let mediaId = null;
    if (imageUrl) {
      mediaId = await uploadImageFromUrl(imageUrl);
    }

    if (mediaId) {
      await rwClient.v2.reply(replyText, tweetId, { media: { media_ids: [mediaId] } });
    } else {
      await rwClient.v2.reply(replyText, tweetId);
    }

    res.status(200).send('Antwort gesendet');
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Antworten');
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Bot ist live auf Port ${port}`));
