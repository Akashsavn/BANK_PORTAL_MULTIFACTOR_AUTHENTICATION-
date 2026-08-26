const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'your-secret-key';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage (replace with database in production)
const users = new Map();
const otpStore = new Map();

// Email transporter (configure with your email service)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'your-email@gmail.com',
    pass: 'your-app-password'
  }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Registration
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, phone } = req.body;
    
    if (users.has(email)) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP temporarily
    otpStore.set(email, { otp, expires: Date.now() + 300000 }); // 5 minutes
    
    // Generate account details
    const accountNumber = '1234' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    const ifscCode = 'SECB0001234';
    
    console.log('Generated account details:', { username, accountNumber, ifscCode });
    
    // Store user data
    const userData = {
      email,
      password: hashedPassword,
      phone,
      name: username,
      accountNumber,
      ifscCode,
      verified: false,
      twoFactorEnabled: false,
      faceData: null
    };
    
    console.log('Storing user data:', userData);
    users.set(email, userData);
    console.log('Users map now contains:', Array.from(users.keys()));

    // Send OTP via email (mock implementation)
    console.log(`OTP for ${email}: ${otp}`);
    
    res.json({ message: 'Registration initiated. Please verify OTP.', email });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Verify OTP
app.post('/api/verify-otp', (req, res) => {
  try {
    const { email, otp } = req.body;
    const storedOTP = otpStore.get(email);
    
    if (!storedOTP || storedOTP.expires < Date.now()) {
      return res.status(400).json({ error: 'OTP expired or invalid' });
    }
    
    if (storedOTP.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }
    
    // Mark user as verified
    const user = users.get(email);
    user.verified = true;
    users.set(email, user);
    
    // Clean up OTP
    otpStore.delete(email);
    
    res.json({ message: 'OTP verified successfully' });
  } catch (error) {
    res.status(500).json({ error: 'OTP verification failed' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = users.get(email);
    
    if (!user || !user.verified) {
      return res.status(400).json({ error: 'Invalid credentials or unverified account' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    // If 2FA is enabled, require a token.
    if (user.twoFactorEnabled) {
      return res.json({ requiresTwoFactor: true, email });
    }
    
    // If user has face data, require face verification
    if (user.faceData) {
      return res.json({ requiresFaceVerification: true, email });
    }

    // If 2FA is not enabled, log them in and give them a token.
    // We can also check if they have a secret but haven't verified it yet.
    const hasSetup2FA = !!user.twoFactorSecret;

    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '1h' });
    if (!hasSetup2FA) {
      return res.json({ token, message: 'Login successful', requires2FASetup: true });
    }
    res.json({ token, message: 'Login successful' });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Setup 2FA
app.post('/api/setup-2fa', (req, res) => { // This should be a protected route
  const { email } = req.body;

  try {
    const user = users.get(email);

    // If user already has 2FA enabled, prevent re-setup
    if (user.twoFactorEnabled) {
        return res.status(400).json({ error: '2FA is already enabled.' });
    }

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }
    
    const secret = speakeasy.generateSecret({
      name: `Bank Portal (${email})`,
      issuer: 'SecureBank'
    });
    
    user.twoFactorSecret = secret.base32;
    users.set(email, user);
    
    QRCode.toDataURL(secret.otpauth_url, (err, dataUrl) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to generate QR code' });
      }
      res.json({ qrCode: dataUrl, secret: secret.base32 });
    });
  } catch (error) {
    res.status(500).json({ error: '2FA setup failed', details: error.message });
  }
});

// Verify 2FA
app.post('/api/verify-2fa', (req, res) => {
  try {
    const { email, token } = req.body;
    let user = users.get(email);

    // This part handles verification during login
    if (!user) {
        // This part handles verification during initial setup (user is already logged in)
        const authToken = req.headers.authorization?.split(' ')[1];
        if (authToken) {
            const decoded = jwt.verify(authToken, JWT_SECRET);
            user = users.get(decoded.email);
            if (!user) return res.status(400).json({ error: 'User not found' });
        }
    }
    
    if (!user || !user.twoFactorSecret) {
      return res.status(400).json({ error: 'User not found or 2FA not set up' });
    }
    
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 2
    });
    
    if (!verified) {
      return res.status(400).json({ error: 'Invalid 2FA token' });
    }
    
    user.twoFactorEnabled = true;
    users.set(email, user);
    
    const jwtToken = jwt.sign({ email }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token: jwtToken, message: '2FA verified successfully' });
  } catch (error) {
    res.status(500).json({ error: '2FA verification failed' });
  }
});

// Protected route
app.get('/api/dashboard', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = users.get(decoded.email);
    console.log('Dashboard - decoded email:', decoded.email);
    console.log('Dashboard - user data:', user);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      message: 'Welcome to your dashboard',
      user: { 
        name: user.name,
        email: user.email, 
        phone: user.phone,
        accountNumber: user.accountNumber,
        ifscCode: user.ifscCode
      }
    });
  } catch (error) {
    console.log('Dashboard error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Register Face
app.post('/api/register-face', (req, res) => {
  try {
    const { email, faceData } = req.body;
    const user = users.get(email);

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    // In a real application, you would process and store face embeddings
    // from a face recognition library, not the raw base64 image.
    user.faceData = faceData;
    users.set(email, user);

    console.log(`Face data registered for ${email}`);
    res.json({ message: 'Face registered successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Face registration failed' });
  }
});

// Verify Face on Login
app.post('/api/verify-face', (req, res) => {
  try {
    const { email, faceData } = req.body;
    const user = users.get(email);

    if (!user || !user.faceData) {
      return res.status(400).json({ error: 'No face data registered for this user.' });
    }

    // --- Placeholder Verification Logic ---
    // In a real application, you would use a face recognition library
    // to compare the embeddings of the stored faceData with the new faceData.
    // For this demo, we'll do a simple check on the data length.
    const isVerified = user.faceData.length > 100 && faceData.length > 100; 

    if (isVerified) {
      const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '1h' });
      res.json({ token, message: 'Face verified successfully' });
    } else {
      res.status(400).json({ error: 'Face verification failed' });
    }
  } catch (error) {
    console.error('Face verification error:', error);
    res.status(500).json({ error: 'An error occurred during face verification' });
  }
});

// Debug endpoint
app.get('/api/debug/users', (req, res) => {
  const userList = Array.from(users.entries()).map(([email, user]) => ({
    email,
    name: user.name,
    accountNumber: user.accountNumber,
    verified: user.verified
  }));
  res.json({ users: userList });
});

app.listen(PORT, () => {
  console.log(`Bank Portal running on http://localhost:${PORT}`);
});