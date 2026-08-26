# SecureBank Portal

A modern bank portal with comprehensive authentication features including login/registration, OTP verification, and Two-Factor Authentication (2FA).

## Features

### 🔐 Authentication System
- **User Registration** with email and phone number
- **Email OTP Verification** for account activation
- **Secure Login** with password hashing
- **Two-Factor Authentication (2FA)** using TOTP
- **JWT Token-based** session management

### 🎨 Modern UI/UX
- **Responsive Design** that works on all devices
- **Modern Navigation Bar** with user menu
- **Modal-based** authentication forms
- **Smooth animations** and transitions
- **Professional banking theme**

### 🛡️ Security Features
- Password hashing with bcrypt
- JWT token authentication
- OTP verification for registration
- 2FA with QR code setup
- Protected dashboard routes

## Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Server**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

3. **Access the Portal**
   Open your browser and go to: `http://localhost:3000`

## Usage

### Registration Process
1. Click "Register" in the navigation
2. Fill in email, phone, and password
3. Verify the OTP sent to your email (check console for OTP in development)
4. Account is now verified and ready for login

### Login Process
1. Click "Login" in the navigation
2. Enter your email and password
3. If 2FA is enabled, enter the code from your authenticator app
4. Access your secure dashboard

### Two-Factor Authentication Setup
1. After login, you'll be prompted to set up 2FA
2. Scan the QR code with an authenticator app (Google Authenticator, Authy, etc.)
3. Enter the 6-digit code to verify and enable 2FA
4. Future logins will require the authenticator code

## API Endpoints

- `POST /api/register` - User registration
- `POST /api/verify-otp` - OTP verification
- `POST /api/login` - User login
- `POST /api/setup-2fa` - Setup 2FA
- `POST /api/verify-2fa` - Verify 2FA code
- `GET /api/dashboard` - Protected dashboard data

## Configuration

### Email Service
Update the email configuration in `server.js`:
```javascript
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: 'your-email@gmail.com',
    pass: 'your-app-password'
  }
});
```

### JWT Secret
Change the JWT secret in production:
```javascript
const JWT_SECRET = 'your-secure-secret-key';
```

## Security Notes

- In production, use a proper database instead of in-memory storage
- Use environment variables for sensitive configuration
- Implement rate limiting for authentication endpoints
- Add HTTPS in production
- Consider implementing account lockout after failed attempts

## Technologies Used

- **Backend**: Node.js, Express.js
- **Authentication**: JWT, bcrypt, Speakeasy (2FA)
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Email**: Nodemailer
- **QR Codes**: qrcode library

## Development

The application uses in-memory storage for demonstration. For production:

1. Replace in-memory storage with a proper database (MongoDB, PostgreSQL, etc.)
2. Add proper error handling and logging
3. Implement rate limiting and security headers
4. Add input validation and sanitization
5. Set up proper email service configuration

## License

This project is for educational purposes. Use at your own risk in production environments.