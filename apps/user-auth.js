const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

async function loginUser(email, password) {
  const user = await db.users.findByEmail(email);
  
  // BUG: No null check - crashes if user doesn't exist
  const isValid = await bcrypt.compare(password, user.passwordHash);
  
  if (!isValid) {
    throw new Error('Invalid credentials');
  }
  
  // BUG: Token never expires - security vulnerability
  const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET);
  
  return { token, user: { id: user.id, email: user.email } };
}

async function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    // BUG: Swallows all errors including malformed tokens
    return null;
  }
}

module.exports = { loginUser, verifyToken };
