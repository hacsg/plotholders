import cron from 'node-cron';
import { runDailyBirthdayRewards } from './services/birthday.js';
import { runWinBackCampaign } from './services/winback.js';

/**
 * Setup all scheduled background jobs.
 * - Birthdays: every day at 09:00 server time
 * - Win-back: every Monday at 10:00
 */
export function setupCronJobs() {
  // Daily birthday rewards at 9am
  cron.schedule('0 9 * * *', async () => {
    console.log('[CRON] Running daily birthday rewards...');
    try {
      const results = await runDailyBirthdayRewards();
      console.log(`[CRON] Birthday run complete. Processed ${results.length} customers.`);
    } catch (err) {
      console.error('[CRON] Birthday job failed:', err);
    }
  });

  // Weekly win-back campaign: Monday 10am
  cron.schedule('0 10 * * 1', async () => {
    console.log('[CRON] Running weekly win-back campaign...');
    try {
      const { notified, skipped } = await runWinBackCampaign();
      console.log(`[CRON] Win-back complete. Notified=${notified}, skipped=${skipped}`);
    } catch (err) {
      console.error('[CRON] Win-back job failed:', err);
    }
  });

  console.log('[CRON] Jobs scheduled: birthdays (daily 9am), win-back (Mon 10am)');
}
