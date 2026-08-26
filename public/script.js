// Global variables
let currentUser = null;
let pendingEmail = null;

// DOM elements
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const loginModal = document.getElementById('loginModal');
const registerModal = document.getElementById('registerModal');
const otpModal = document.getElementById('otpModal');
const twoFAModal = document.getElementById('twoFAModal');
const verify2FAModal = document.getElementById('verify2FAModal');
const faceModal = document.getElementById('faceModal');
const verifyFaceModal = document.getElementById('verifyFaceModal');
const userMenu = document.getElementById('userMenu');
const userEmail = document.getElementById('userEmail');
const logoutBtn = document.getElementById('logoutBtn');
const dashboard = document.getElementById('dashboard');
const hero = document.querySelector('.hero');

// Face verification variables
let faceStream = null;
let faceModelsLoaded = false;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    checkAuthStatus();
});

function initializeApp() {
    // Mobile menu toggle
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('nav-menu');
    
    hamburger.addEventListener('click', () => {
        navMenu.classList.toggle('active');
    });
}

function setupEventListeners() {
    // Modal controls
    loginBtn.addEventListener('click', () => showModal('loginModal'));
    registerBtn.addEventListener('click', () => showModal('registerModal'));
    
    // Close modals
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            hideModal(modal.id);
        });
    });
    
    // Switch between login/register
    document.getElementById('switchToRegister').addEventListener('click', (e) => {
        e.preventDefault();
        hideModal('loginModal');
        showModal('registerModal');
    });
    
    document.getElementById('switchToLogin').addEventListener('click', (e) => {
        e.preventDefault();
        hideModal('registerModal');
        showModal('loginModal');
    });
    
    // Form submissions
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('otpForm').addEventListener('submit', handleOTPVerification);
    document.getElementById('twoFAForm').addEventListener('submit', handle2FASetup);
    document.getElementById('verify2FAForm').addEventListener('submit', handle2FAVerification);
    
    // Skip 2FA
    document.getElementById('skip2FA').addEventListener('click', () => {
        hideModal('twoFAModal');
        document.getElementById('skip2FA').style.display = 'block';
        showFaceVerification();
    });
    
    // Face verification
    document.getElementById('captureFace').addEventListener('click', captureFace);
    document.getElementById('skipFace').addEventListener('click', () => {
        stopFaceCamera();
        hideModal('faceModal');
        showDashboard();
    });
    
    // Face verification on login
    document.getElementById('verifyFaceBtn').addEventListener('click', handleFaceVerification);
    document.getElementById('cancelFaceVerify').addEventListener('click', cancelFaceVerification);

    // Get Started button
    document.getElementById('getStartedBtn').addEventListener('click', () => {
        if (currentUser) {
            document.getElementById('dashboard').scrollIntoView({
                behavior: 'smooth'
            });
        } else {
            showModal('loginModal');
        }
    });
    
    // Logout
    logoutBtn.addEventListener('click', handleLogout);
    
    // Close modals on outside click
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            hideModal(e.target.id);
        }
    });
}

function showModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
}

function hideModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

async function handleRegister(e) {
    e.preventDefault();
    
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const phone = document.getElementById('registerPhone').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (password !== confirmPassword) {
        showNotification('Passwords do not match', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, phone, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            pendingEmail = email;
            hideModal('registerModal');
            showModal('otpModal');
            showNotification('Registration successful! Please check your email for OTP.', 'success');
        } else {
            console.error('Registration failed:', data);
            showNotification(data.error || 'Registration failed', 'error');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showNotification('Registration failed. Please try again.', 'error');
    }
}

async function handleOTPVerification(e) {
    e.preventDefault();
    
    const otp = document.getElementById('otpCode').value.trim();
    
    if (!otp) {
        showNotification('Please enter the OTP code', 'error');
        return;
    }
    
    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
        showNotification('OTP must be exactly 6 digits', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/verify-otp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: pendingEmail, otp })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            hideModal('otpModal');
            showNotification('Account verified successfully! Please setup QR authentication.', 'success');
            await setup2FAForRegistration();
        } else {
            showNotification(data.error, 'error');
            document.getElementById('otpCode').value = '';
            document.getElementById('otpCode').focus();
        }
    } catch (error) {
        showNotification('OTP verification failed. Please try again.', 'error');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            pendingEmail = email;
            hideModal('loginModal');
            
            if (data.requiresTwoFactor) {
                // User has 2FA enabled, show the verification code input.
                showExisting2FAVerification();
            } else if (data.requiresFaceVerification) {
                // User has Face Auth enabled, show the face verification modal.
                showFaceVerificationLogin();
            } else if (data.requires2FASetup) {
                // New user or 2FA not set up, prompt for QR setup.
                await setup2FAForLogin();
            } else {
                // Login successful with no extra steps.
                localStorage.setItem('token', data.token);
                currentUser = { email };
                showFaceVerification();
            }
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        showNotification('Login failed. Please try again.', 'error');
    }
}

async function handle2FAVerification(e) {
    e.preventDefault();
    
    const token = document.getElementById('verify2FACode').value;
    
    try {
        const response = await fetch('/api/verify-2fa', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: pendingEmail, token })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            if (data.requiresFaceVerification) {
                hideModal('verify2FAModal');
                showFaceVerification();
            } else {
                localStorage.setItem('token', data.token);
                currentUser = { email: pendingEmail };
                hideModal('verify2FAModal');
                showDashboard();
                showNotification('2FA verification successful!', 'success');
            }
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        showNotification('2FA verification failed. Please try again.', 'error');
    }
}

async function handle2FASetup(e) {
    e.preventDefault();
    
    const token = document.getElementById('twoFACode').value;
    const email = pendingEmail || (currentUser && currentUser.email);
    
    if (token.length !== 6) {
        showNotification('Please enter a 6-digit code', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/verify-2fa', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: email, token: token })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            currentUser = { email: email };
            hideModal('twoFAModal');
            showNotification('QR Authentication setup complete!', 'success');
            showFaceVerification();
        } else {
            console.error('2FA setup failed:', data);
            showNotification(data.error || 'Invalid authentication code. Please try again.', 'error');
            document.getElementById('twoFACode').value = '';
            document.getElementById('twoFACode').focus();
        }
    } catch (error) {
        console.error('2FA setup error:', error);
        showNotification('Authentication failed. Please try again.', 'error');
        document.getElementById('twoFACode').value = '';
        document.getElementById('twoFACode').focus();
    }
}

async function setup2FAForLogin() {
    try {
        const response = await fetch('/api/setup-2fa', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: pendingEmail })
        });
        
        const data = await response.json();
        
        if (response.ok && data.qrCode) {
            document.getElementById('qrCode').innerHTML = `<img src="${data.qrCode}" alt="QR Code" style="max-width: 200px; height: auto;">`;
            document.querySelector('#twoFAModal h2').textContent = 'Setup QR Authentication';
            showModal('twoFAModal');
            document.getElementById('skip2FA').style.display = 'none';
        } else {
            showNotification(data.error || 'Failed to setup QR authentication', 'error');
        }
    } catch (error) {
        showNotification('QR authentication setup failed. Please try again.', 'error');
    }
}

function showExisting2FAVerification() {
    document.querySelector('#verify2FAModal h2').textContent = 'Enter Authentication Code';
    document.querySelector('#verify2FAModal p').textContent = 'Enter the 6-digit code from your authenticator app:';
    document.getElementById('verify2FACode').value = '';
    showModal('verify2FAModal');
}

function showDashboard() {
    document.getElementById('dashboard').style.setProperty('display', 'block', 'important');
    document.getElementById('services').style.setProperty('display', 'block', 'important');
    document.getElementById('about').style.setProperty('display', 'block', 'important');
    document.getElementById('contact').style.setProperty('display', 'block', 'important');
    
    loginBtn.style.display = 'none';
    registerBtn.style.display = 'none';
    userMenu.style.display = 'flex';
    userEmail.textContent = currentUser.email;
    
    document.querySelector('#dashboard h2').textContent = `Welcome, ${currentUser.name || currentUser.email.split('@')[0]}`;
    
    // Always fetch fresh dashboard data to ensure account details are populated
    fetchDashboardData();
}

function fetchDashboardData() {
    const token = localStorage.getItem('token');
    console.log('Token:', token);
    if (token) {
        fetch('/api/dashboard', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => {
            console.log('Dashboard response status:', response.status);
            return response.json();
        })
        .then(data => {
            console.log('Dashboard API response:', data);
            if (data.user) {
                currentUser = { ...currentUser, ...data.user };
                console.log('Updated currentUser:', currentUser);
                populateAccountDetails(data.user);
                // Update welcome message with proper name
                document.querySelector('#dashboard h2').textContent = `Welcome, ${data.user.name || data.user.email.split('@')[0]}`;
            } else {
                console.error('No user data in response');
                // Populate with test data for now
                populateAccountDetails(null);
            }
        })
        .catch(error => {
            console.error('Failed to fetch dashboard data:', error);
            // Populate with test data for now
            populateAccountDetails(null);
        });
    } else {
        console.error('No token found');
    }
}

function hideDashboard() {
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('services').style.display = 'none';
    document.getElementById('about').style.display = 'none';
    document.getElementById('contact').style.display = 'none';
    
    loginBtn.style.display = 'block';
    registerBtn.style.display = 'block';
    userMenu.style.display = 'none';
    
    document.querySelector('#dashboard h2').textContent = 'Dashboard';
}

function handleLogout() {
    localStorage.removeItem('token');
    currentUser = null;
    hideDashboard();
    showNotification('Logged out successfully!', 'success');
}

function checkAuthStatus() {
    const token = localStorage.getItem('token');
    if (token) {
        fetch('/api/dashboard', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.user) {
                currentUser = data.user;
                populateAccountDetails(data.user);
                showDashboard();
            } else {
                localStorage.removeItem('token');
            }
        })
        .catch(() => {
            localStorage.removeItem('token');
        });
    }
}

function populateAccountDetails(user) {
    console.log('Populating account details with:', user);
    const userNameEl = document.getElementById('userName');
    const accountNumberEl = document.getElementById('accountNumber');
    const ifscCodeEl = document.getElementById('ifscCode');
    
    console.log('Elements found:', { userNameEl, accountNumberEl, ifscCodeEl });
    
    // Test with hardcoded values first
    if (userNameEl) {
        userNameEl.textContent = user?.name || 'Test User';
        console.log('Set userName to:', user?.name || 'Test User');
    }
    if (accountNumberEl) {
        accountNumberEl.textContent = user?.accountNumber || '1234567890';
        console.log('Set accountNumber to:', user?.accountNumber || '1234567890');
    }
    if (ifscCodeEl) {
        ifscCodeEl.textContent = user?.ifscCode || 'SECB0001234';
        console.log('Set ifscCode to:', user?.ifscCode || 'SECB0001234');
    }
}

async function showFaceVerification() {
    showModal('faceModal');
    try {
        faceStream = await navigator.mediaDevices.getUserMedia({ video: true });
        document.getElementById('faceVideo').srcObject = faceStream;
    } catch (error) {
        showNotification('Camera access denied. Skipping face verification.', 'error');
        setTimeout(() => {
            hideModal('faceModal');
            showDashboard();
        }, 2000);
    }
}

async function captureFace() {
    try {
        const video = document.getElementById('faceVideo');
        const canvas = document.getElementById('faceCanvas');
        const ctx = canvas.getContext('2d');
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const faceData = canvas.toDataURL('image/jpeg', 0.8);
        
        const response = await fetch('/api/register-face', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                email: currentUser?.email || pendingEmail, 
                faceData: faceData 
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Face registered successfully!', 'success');
            stopFaceCamera();
            hideModal('faceModal');
            showDashboard();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        showNotification('Face capture failed. Please try again.', 'error');
    }
}

function stopFaceCamera() {
    if (faceStream) {
        faceStream.getTracks().forEach(track => track.stop());
        faceStream = null;
        document.getElementById('faceVideo').srcObject = null;
        document.getElementById('verifyFaceVideo').srcObject = null;
    }
}

async function showFaceVerificationLogin() {
    showModal('verifyFaceModal');
    try {
        faceStream = await navigator.mediaDevices.getUserMedia({ video: true });
        document.getElementById('verifyFaceVideo').srcObject = faceStream;
    } catch (error) {
        showNotification('Camera access denied. Cannot verify face.', 'error');
        setTimeout(() => {
            hideModal('verifyFaceModal');
        }, 2000);
    }
}

function cancelFaceVerification() {
    stopFaceCamera();
    hideModal('verifyFaceModal');
    pendingEmail = null;
}

async function handleFaceVerification() {
    try {
        const video = document.getElementById('verifyFaceVideo');
        const canvas = document.getElementById('verifyFaceCanvas');
        const ctx = canvas.getContext('2d');

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const faceData = canvas.toDataURL('image/jpeg', 0.8);

        const response = await fetch('/api/verify-face', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: pendingEmail,
                faceData: faceData
            })
        });

        const data = await response.json();

        if (response.ok) {
            if (data.requiresTwoFactor) {
                hideModal('verifyFaceModal');
                showExisting2FAVerification();
            } else if (data.requires2FASetup) {
                hideModal('verifyFaceModal');
                await setup2FAForLogin();
            } else {
                localStorage.setItem('token', data.token);
                currentUser = { email: pendingEmail };
                stopFaceCamera();
                hideModal('verifyFaceModal');
                showDashboard();
                showNotification('Face verified successfully!', 'success');
            }
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        showNotification('Face verification failed. Please try again.', 'error');
    }
}

async function setup2FAForRegistration() {
    try {
        const response = await fetch('/api/setup-2fa', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: pendingEmail })
        });
        
        const data = await response.json();
        
        if (response.ok && data.qrCode) {
            document.getElementById('qrCode').innerHTML = `<img src="${data.qrCode}" alt="QR Code" style="max-width: 200px; height: auto;">`;
            document.querySelector('#twoFAModal h2').textContent = 'Setup QR Authentication';
            showModal('twoFAModal');
            document.getElementById('skip2FA').style.display = 'none';
        } else {
            showNotification(data.error || 'Failed to setup QR authentication', 'error');
        }
    } catch (error) {
        showNotification('QR authentication setup failed. Please try again.', 'error');
    }
}