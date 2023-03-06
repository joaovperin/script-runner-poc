import dotenv from 'dotenv';
import { Log } from 'gudangjs';

dotenv.config();

Log.info(`⚡️[worker]: Hello from worker!`);

// await navigator.onDialog(async (dialog) => {
//     await navigator.delay(300, 400)
//     dialog.accept()
// })