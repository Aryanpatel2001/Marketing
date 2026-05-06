/**
 * Payment processing service
 * BUG: Race condition - checking balance and deducting aren't atomic
 */
async function processPayment(userId, amount) {
  const balance = await db.getBalance(userId);  // Read
  
  if (balance < amount) {
    throw new Error(`Insufficient funds: ${balance} < ${amount}`);
  }
  
  // BUG: Another request could deduct between read and write
  await db.deductBalance(userId, amount);  // Write - NOT atomic with read above
  
  await queue.publish('payment.completed', { userId, amount });
  return { success: true, remaining: balance - amount };
}

module.exports = { processPayment };
