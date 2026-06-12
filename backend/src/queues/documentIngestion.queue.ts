import { Queue } from "bullmq";
// const connection = require("../config/redis.js");
import {connection} from "../config/redis.js";

export const documentIngestionQueue = new Queue("document-ingestion", {
  connection,
});



// const { Queue } = require('bullmq');
// const connection = require('./config/redis');

// const emailQueue = new Queue('emails', { connection });

// async function addEmailJob(to, subject, body) {
//   await emailQueue.add('send', { to, subject, body });
// }

// module.exports = { emailQueue, addEmailJob };
