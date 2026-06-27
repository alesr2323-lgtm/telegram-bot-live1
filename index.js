require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const { Cashfree } = require('cashfree-pg');

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const app = express();
app.use(express.json());

// Add Profiles button click பண்ணா
bot.action('add_profiles', async (ctx) => {
  await ctx.answerCbQuery(); // மேல loading போகும்
  
  // பழைய msg-அ edit பண்ணி button போடலாம்
  await ctx.editMessageText('பிரிவு என்ன select பண்ணுங்க bro 👇', {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '👨 Male', callback_data: 'gender_male' },
          { text: '👩 Female', callback_data: 'gender_female' }
        ],
        [
          { text: '⬅️ Back', callback_data: 'back_home' }
        ]
      ]
    }
  });
});

// Male button click பண்ணா
bot.action('gender_male', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('✅ Male select பண்ணிட்டீங்க. \n\nஇப்போ Name type பண்ணுங்க:');
  // இங்க Supabase-ல gender = 'male' save பண்ற logic போடலாம்
});

// Female button click பண்ணா
bot.action('gender_female', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('✅ Female select பண்ணிட்டீங்க. \n\nஇப்போ Name type பண்ணுங்க:');
  // இங்க Supabase-ல gender = 'female' save பண்ற logic
});

// Back button
bot.action('back_home', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('Main menu:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Couples Live', callback_data: 'couples' }],
        [{ text: 'Add Profiles', callback_data: 'add_profiles' }]
      ]
    }
  });
});

// Cashfree Config
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = Cashfree.Environment.SANDBOX; // PRODUCTION க்கு மாத்திக்கோ

const ADMIN_ID = Number(process.env.ADMIN_ID);
const PRICE = Number(process.env.PRICE) || 99;
const BASE_URL = process.env.BASE_URL;

const FAKE_COMMENTS = ["Hi 🖐️", "Wow super live 😍", "Nice dear", "Beautiful 🧡", "Gifts sent 🎁"];
const userTimers = new Map();

// Get profiles from Supabase
async function getProfiles(type) {
  const { data, error } = await supabase.from('profiles').select('*').eq('type', type);
  if (error) console.error(error);
  return data || [];
}

bot.start(async (ctx) => {
  const userId = ctx.from.id;
  let welcomeText = `👋 Connect IN லைவ் பாட்டிற்கு வரவேற்கிறோம்!`;
  let buttons = [
    [Markup.button.text('👩‍❤️‍👨 Couples Live'), Markup.button.text('👩 Singles Live')],
    [Markup.button.text('📝 Apply to Host')]
  ];
  if (userId === ADMIN_ID) {
    welcomeText += `\n\n👑 *அட்மின் கணக்கு* /addprofile பண்ணலாம்`;
  }
  ctx.reply(welcomeText, Markup.keyboard(buttons).resize());
});

const sendProfileList = async (ctx, type) => {
  const profiles = await getProfiles(type);
  if (profiles.length === 0) return ctx.reply("தற்போது லைவ் எதுவும் இல்லை.");

  for (const p of profiles) {
    let captionText = `🔴 <b>LIVE NOW</b>\n${type === 'couple'? '👥' : '👩'} <b>பெயர்:</b> ${p.name}\n🎂 <b>வயது:</b> ${p.age}\n📍 <b>ஊர்:</b> ${p.city}\n👁️ <b>பார்ப்பவர்கள்:</b> ${p.views}`;
    await ctx.replyWithPhoto(p.photo, {
      caption: captionText,
      parse_mode: 'HTML',
    ...Markup.inlineKeyboard([[Markup.button.callback('▶️ லைவ் பார்க்க (30s Free)', `watch_${p.id}`)]])
    });
  }
};

bot.hears('👩‍❤️‍👨 Couples Live', (ctx) => sendProfileList(ctx, 'couple'));
bot.hears('👩 Singles Live', (ctx) => sendProfileList(ctx, 'single'));

bot.action(/watch_(\d+)/, async (ctx) => {
  const userId = ctx.from.id;
  const profileId = ctx.match[1];
  const { data: p } = await supabase.from('profiles').select('*').eq('id', profileId).single();
  ctx.answerCbQuery().catch(() => {});

  if (!p) return ctx.reply("❌ வீடியோ கிடைக்கல");

  if (userTimers.has(userId)) {
    userTimers.get(userId).forEach(t => clearTimeout(t));
  }

  await ctx.reply(`🔴 ${p.name}-இன் நேரலை. (30 வினாடிகள் இலவசம்)`);
  await ctx.replyWithVideo(p.video, { caption: `● LIVE - ${p.name}` }).catch(() => {});

  let chatTimers = [];
  for (let i = 1; i <= 3; i++) {
    let timer = setTimeout(() => {
      const randomComment = FAKE_COMMENTS[Math.floor(Math.random() * FAKE_COMMENTS.length)];
      const fakeUser = `User_${Math.floor(Math.random() * 9000) + 1000}`;
      ctx.reply(`💬 ${fakeUser}: ${randomComment}`).catch(() => {});
    }, i * 6000);
    chatTimers.push(timer);
  }
  userTimers.set(userId, chatTimers);

  setTimeout(async () => {
    chatTimers.forEach(t => clearTimeout(t));
    userTimers.delete(userId);

    // Create Cashfree Order
    const orderId = `order_${userId}_${profileId}_${Date.now()}`;
    const request = {
      order_id: orderId,
      order_amount: PRICE,
      order_currency: "INR",
      customer_details: {
        customer_id: String(userId),
        customer_phone: "9999999999" // Cashfree க்கு தேவை
      },
      order_meta: {
        return_url: `https://t.me/${ctx.botInfo.username}?start=paid_${orderId}`
      }
    };

    try {
      const response = await Cashfree.PGCreateOrder("2023-08-01", request);
      const paymentLink = response.data.payment_link;

      // Save to DB
      await supabase.from('payments').insert({
        user_id: userId,
        profile_id: profileId,
        order_id: orderId,
        amount: PRICE,
        status: 'pending'
      });

      ctx.reply(
        `🛑 <b>இலவச ட்ரையல் முடிந்தது!</b>\n\n${p.name}-இன் முழு லைவ் பார்க்க ₹${PRICE} செலுத்தவும்.`,
        {
          parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.url('💳 Pay Now', paymentLink)]])
        }
      );
    } catch (err) {
      console.error(err);
      ctx.reply("Payment link create பண்ண முடியல. Admin கிட்ட சொல்லுங்க.");
    }
  }, 30000);
});

// Cashfree Webhook - Render இத call பண்ணும்
app.post('/webhook/cashfree', async (req, res) => {
  try {
    const data = req.body.data;
    const order = data.order;

    if (data.payment.payment_status === 'SUCCESS') {
      // Update DB
      await supabase.from('payments')
       .update({ status: 'success' })
       .eq('order_id', order.order_id);

      const userId = order.customer_details.customer_id;
      const profileId = order.order_id.split('_')[2];

      const { data: p } = await supabase.from('profiles').select('name').eq('id', profileId).single();

      await bot.telegram.sendMessage(
        userId,
        `✅ Payment Success! ${p?.name} லைவ் இப்போ முழுசா பார்க்கலாம். Enjoy bro 🔥`
      );
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).send('Error');
  }
});

// Admin add profile - Supabase க்கு save பண்ணு
let adminState = {};
bot.command('addprofile', (ctx) => {
  if (ctx.from.id!== ADMIN_ID) return;
  adminState[ctx.from.id] = { step: 'ask_type' };
  ctx.reply("🆕 பிரிவு என்ன?", Markup.keyboard([['couple', 'single']]).oneTime().resize());
});

//... மத்த addprofile flow அதே மாதிரி, கடைசில video வந்ததும் இத போடு:
bot.on('video', async (ctx) => {
  const userId = ctx.from.id;
  if (userId!== ADMIN_ID ||!adminState[userId] || adminState[userId].step!== 'ask_video') return;

  const { error } = await supabase.from('profiles').insert({
    name: adminState[userId].name,
    type: adminState[userId].type,
    age: adminState[userId].age,
    city: adminState[userId].city,
    views: `${Math.floor(Math.random() * 3) + 1}.${Math.floor(Math.random() * 9)}K`,
    photo: adminState[userId].photo,
    video: ctx.message.video.file_id
  });

  if (error) ctx.reply("DB Error: " + error.message);
  else ctx.reply("✅ Supabase ல save ஆயிடுச்சு!", Markup.removeKeyboard());

  delete adminState[userId];
});

bot.catch((err, ctx) => console.error(`Error for ${ctx.updateType}`, err));

// Express + Bot Launch
app.get('/', (req, res) => res.send('Bot Running'));
app.listen(process.env.PORT || 3000, async () => {
  await bot.launch();
  console.log("🚀 Bot + Webhook Ready on Render!");
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
