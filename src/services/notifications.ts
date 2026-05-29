import { Resend } from 'resend';
import twilio from 'twilio';
import { Customer, Tier } from '../types/index.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

let resend: Resend | null = null;
let twilioClient: twilio.Twilio | null = null;

function getResend() {
  if (!resend && RESEND_API_KEY) {
    resend = new Resend(RESEND_API_KEY);
  }
  return resend;
}

function getTwilio() {
  if (!twilioClient && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

export async function sendEmail(to: string, subject: string, html: string) {
  const client = getResend();
  if (client) {
    try {
      await client.emails.send({
        from: 'Plot Holders <plotholders@hundredacre.sg>',
        to,
        subject,
        html,
      });
      console.log(`[Email] Sent to ${to}: ${subject}`);
    } catch (err) {
      console.error('[Email] Resend error:', err);
      console.log(`[Email:FALLBACK] To: ${to} | Subject: ${subject}\n${html}`);
    }
  } else {
    console.log(`[Email:DEV] To: ${to} | Subject: ${subject}\n${html}`);
  }
}

export async function sendSMS(to: string, body: string) {
  const client = getTwilio();
  if (client && TWILIO_PHONE_NUMBER) {
    try {
      await client.messages.create({
        body,
        from: TWILIO_PHONE_NUMBER,
        to,
      });
      console.log(`[SMS] Sent to ${to}`);
    } catch (err) {
      console.error('[SMS] Twilio error:', err);
      console.log(`[SMS:FALLBACK] To: ${to} | Body: ${body}`);
    }
  } else {
    console.log(`[SMS:DEV] To: ${to} | Body: ${body}`);
  }
}

const TIER_PERKS: Record<Tier, string> = {
  seedling: 'Welcome to the club! Start earning acres on every purchase.',
  grower: 'Priority delivery slots + 5% off select merch',
  homesteader: 'Free 6-pack upgrade on first order of the month',
  landowner: 'Early access to seasonal flavors + private harvest dinner invites',
};

export async function notifyTierUpgrade(customer: Customer, _oldTier: Tier, newTier: Tier) {
  const perk = TIER_PERKS[newTier] || '';
  const message = `🌱 Congratulations! You've reached ${newTier.toUpperCase()} status. Your new perk: ${perk}`;

  if (customer.email) {
    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <h1 style="color: #2f6f3e;">Plot Holders Club</h1>
        <p style="font-size: 18px;">${message}</p>
        <p style="color: #555;">Thank you for growing with us at The Acre.</p>
        <p><a href="${APP_URL}" style="color: #2f6f3e;">View your dashboard →</a></p>
      </div>
    `;
    await sendEmail(customer.email, `Welcome to ${newTier}! 🌱`, html);
  }
  if (customer.phone) {
    await sendSMS(customer.phone, message);
  }
}

export async function notifyBirthday(customer: Customer, discountCode: string) {
  const message = `🎂 Happy birthday from The Acre! Use code ${discountCode} for a free treat (valid 7 days).`;

  if (customer.email) {
    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <h1 style="color: #2f6f3e;">Happy Birthday! 🎂</h1>
        <p style="font-size: 18px;">${message}</p>
        <p style="color: #555;">We hope you have a wonderful day. Come celebrate with us.</p>
      </div>
    `;
    await sendEmail(customer.email, 'Happy Birthday from Plot Holders! 🎂', html);
  }
  if (customer.phone) {
    await sendSMS(customer.phone, message);
  }
}

export async function notifyReferralSignup(referrer: Customer) {
  const message = `🎉 Your friend joined Plot Holders! You earned a bonus acre. Thank you for spreading the word.`;

  if (referrer.email) {
    const html = `<p>${message}</p><p><a href="${APP_URL}">See your updated balance</a></p>`;
    await sendEmail(referrer.email, 'Referral Bonus Earned! 🎉', html);
  }
  if (referrer.phone) {
    await sendSMS(referrer.phone, message);
  }
}

export async function notifyWinBack(customer: Customer, daysSinceLastOrder: number) {
  const message = `We miss you at The Acre! It's been ${daysSinceLastOrder} days since your last visit. Come back for fresh coffee and earn more acres.`;

  if (customer.email) {
    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <h1 style="color: #2f6f3e;">We miss you 🌱</h1>
        <p>${message}</p>
        <p><a href="${APP_URL}">Open your portal</a></p>
      </div>
    `;
    await sendEmail(customer.email, 'We miss you at The Acre!', html);
  }
  if (customer.phone) {
    await sendSMS(customer.phone, message);
  }
}
