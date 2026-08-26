from flask import Flask, request, jsonify, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
import pyotp
import qrcode
import io
import base64
import random
import datetime
from functools import wraps

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'

# In-memory storage
users = {}
otp_store = {}

# JWT token decorator
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'Token missing'}), 401
        try:
            token = token.split(' ')[1]
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            current_user = users.get(data['email'])
        except:
            return jsonify({'error': 'Token invalid'}), 401
        return f(current_user, *args, **kwargs)
    return decorated

@app.route('/')
def index():
    return send_from_directory('public', 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('public', filename)

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    phone = data.get('phone')
    
    if email in users:
        return jsonify({'error': 'User already exists'}), 400
    
    # Generate OTP
    otp = str(random.randint(100000, 999999))
    otp_store[email] = {
        'otp': otp,
        'expires': datetime.datetime.now() + datetime.timedelta(minutes=5)
    }
    
    # Store user
    users[email] = {
        'email': email,
        'password': generate_password_hash(password),
        'phone': phone,
        'verified': False,
        'two_factor_enabled': False,
        'two_factor_secret': None,
        'face_data': None
    }
    
    print(f"OTP for {email}: {otp}")
    return jsonify({'message': 'Registration initiated. Please verify OTP.', 'email': email})

@app.route('/api/verify-otp', methods=['POST'])
def verify_otp():
    data = request.get_json()
    email = data.get('email')
    otp = data.get('otp')
    
    stored_otp = otp_store.get(email)
    if not stored_otp or stored_otp['expires'] < datetime.datetime.now():
        return jsonify({'error': 'OTP expired or invalid'}), 400
    
    if stored_otp['otp'] != otp:
        return jsonify({'error': 'Invalid OTP'}), 400
    
    users[email]['verified'] = True
    del otp_store[email]
    
    return jsonify({'message': 'OTP verified successfully'})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    
    user = users.get(email)
    if not user or not user['verified']:
        return jsonify({'error': 'Invalid credentials or unverified account'}), 400
    
    if not check_password_hash(user['password'], password):
        return jsonify({'error': 'Invalid credentials'}), 400
    
    # Check if user has 2FA secret (means they've seen QR before)
    has_existing = bool(user['two_factor_secret'])
    print(f"Login check for {email}: secret={bool(user['two_factor_secret'])}, hasExisting={has_existing}")
    return jsonify({'requiresTwoFactor': True, 'hasExisting2FA': has_existing, 'email': email})

@app.route('/api/setup-2fa', methods=['POST'])
def setup_2fa():
    try:
        data = request.get_json()
        email = data.get('email')
        
        user = users.get(email)
        if not user:
            return jsonify({'error': 'User not found'}), 400
        
        # Only generate new secret if user doesn't have one already
        if not user['two_factor_secret']:
            secret = pyotp.random_base32()
            users[email]['two_factor_secret'] = secret
            
            # Generate QR code
            totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
                name=email,
                issuer_name="SecureBank Portal"
            )
            
            qr = qrcode.QRCode(version=1, box_size=8, border=4)
            qr.add_data(totp_uri)
            qr.make(fit=True)
            
            img = qr.make_image(fill_color="black", back_color="white")
            buffer = io.BytesIO()
            img.save(buffer, format='PNG')
            buffer.seek(0)
            
            qr_code_data = base64.b64encode(buffer.getvalue()).decode()
            qr_code_url = f"data:image/png;base64,{qr_code_data}"
            
            return jsonify({'qrCode': qr_code_url, 'isNewSetup': True})
        else:
            return jsonify({'message': 'Use existing authenticator app', 'isNewSetup': False})
    except Exception as e:
        return jsonify({'error': 'Failed to setup 2FA'}), 500

@app.route('/api/verify-2fa', methods=['POST'])
def verify_2fa():
    try:
        data = request.get_json()
        email = data.get('email')
        token = data.get('token')
        
        print(f"Verifying 2FA for {email} with token {token}")
        
        user = users.get(email)
        if not user or not user['two_factor_secret']:
            return jsonify({'error': 'User not found or 2FA not set up'}), 400
        
        totp = pyotp.TOTP(user['two_factor_secret'])
        current_code = totp.now()
        print(f"Current valid code: {current_code}")
        
        if not totp.verify(token, valid_window=2):
            return jsonify({'error': 'Invalid 2FA token'}), 400
        
        users[email]['two_factor_enabled'] = True
        print(f"2FA enabled for {email}")
        
        jwt_token = jwt.encode({
            'email': email,
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=1)
        }, app.config['SECRET_KEY'], algorithm='HS256')
        
        return jsonify({'token': jwt_token, 'message': '2FA verified successfully'})
    except Exception as e:
        print(f"2FA Verify Error: {e}")
        return jsonify({'error': 'Failed to verify 2FA'}), 500

@app.route('/api/register-face', methods=['POST'])
def register_face():
    try:
        data = request.get_json()
        email = data.get('email')
        face_data = data.get('faceData')
        
        user = users.get(email)
        if not user:
            return jsonify({'error': 'User not found'}), 400
        
        users[email]['face_data'] = face_data
        print(f"Face registered for {email}")
        
        return jsonify({'message': 'Face registered successfully'})
    except Exception as e:
        print(f"Face Registration Error: {e}")
        return jsonify({'error': 'Failed to register face'}), 500

@app.route('/api/verify-face', methods=['POST'])
def verify_face():
    try:
        data = request.get_json()
        email = data.get('email')
        face_data = data.get('faceData')
        
        user = users.get(email)
        if not user or not user['face_data']:
            return jsonify({'error': 'No face data registered'}), 400
        
        # Simple face verification (in production, use proper face recognition)
        if face_data and len(face_data) > 100:  # Basic validation
            return jsonify({'verified': True, 'message': 'Face verified successfully'})
        else:
            return jsonify({'verified': False, 'error': 'Face verification failed'})
    except Exception as e:
        print(f"Face Verification Error: {e}")
        return jsonify({'verified': False, 'error': 'Face verification failed'})

@app.route('/api/dashboard', methods=['GET'])
@token_required
def dashboard(current_user):
    return jsonify({
        'message': 'Welcome to your dashboard',
        'user': {
            'email': current_user['email'],
            'phone': current_user['phone']
        }
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)