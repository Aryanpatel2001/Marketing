/* eslint-disable @typescript-eslint/no-var-requires, no-console */
const amqp = require('amqplib');

const url = 'amqp://guest:guest@127.0.0.1:5672';

console.log(`Connecting to ${url} with frameMax param ...`);

(async () => {
  try {
    const conn = await amqp.connect(`${url}?frameMax=131072`);
    console.log('Connected successfully!');
    await conn.close();
  } catch (error) {
    console.error('Connection failed:', error);
  }
})();
