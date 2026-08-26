from flask import Flask, request, jsonify, render_template_string, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
import pyotp
import qrcode
import io
import base64
import random
import datetime
from functools import wraps
import cv2
import numpy as np
from PIL import Image
import hashlib

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'

# In-memory storage
users = {}
otp_store = {}
face_data = {}

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
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    phone = data.get('phone')
    
    if not email or not password or not phone or not username:
        return jsonify({'error': 'Username, email, password, and phone are required'}), 400
    
    if email in users:
        return jsonify({'error': 'User already exists'}), 400
    
    # Generate OTP
    otp = str(random.randint(100000, 999999))
    otp_store[email] = {
        'otp': otp,
        'expires': datetime.datetime.now() + datetime.timedelta(minutes=5)
    }
    
    # Generate account details
    account_number = '1234' + str(random.randint(100000, 999999))
    ifsc_code = 'SECB0001234'
    
    # Store user
    users[email] = {
        'name': username,
        'email': email,
        'password': generate_password_hash(password),
        'phone': phone,
        'accountNumber': account_number,
        'ifscCode': ifsc_code,
        'verified': False,
        'face_registered': False,
        'two_factor_enabled': False,
        'two_factor_secret': None
    }
    
    print(f"\n=== OTP GENERATED ===")
    print(f"Email: {email}")
    print(f"OTP: {otp}")
    print(f"Expires: {otp_store[email]['expires']}")
    print(f"Current OTP Store: {otp_store}")
    print(f"=====================\n")
    
    return jsonify({'message': 'Registration initiated. Please verify OTP.', 'email': email})

@app.route('/api/verify-otp', methods=['POST'])
def verify_otp():
    data = request.get_json()
    email = data.get('email')
    otp = data.get('otp')
    
    print(f"\n=== OTP VERIFICATION ===")
    print(f"Email: {email}")
    print(f"Received OTP: {otp}")
    print(f"Current OTP Store: {otp_store}")
    
    if not email or not otp:
        print("Error: Missing email or OTP")
        return jsonify({'error': 'Email and OTP are required'}), 400
    
    if len(otp) != 6 or not otp.isdigit():
        print(f"Error: Invalid OTP format - Length: {len(otp)}, Is digit: {otp.isdigit()}")
        return jsonify({'error': 'OTP must be 6 digits'}), 400
    
    stored_otp = otp_store.get(email)
    if not stored_otp:
        print(f"Error: No OTP found for email {email}")
        return jsonify({'error': 'No OTP found for this email'}), 400
    
    print(f"Stored OTP: {stored_otp['otp']}")
    print(f"Expires at: {stored_otp['expires']}")
    print(f"Current time: {datetime.datetime.now()}")
        
    if stored_otp['expires'] < datetime.datetime.now():
        print("Error: OTP expired")
        del otp_store[email]
        return jsonify({'error': 'OTP has expired. Please register again.'}), 400
    
    if stored_otp['otp'] != otp:
        print(f"Error: OTP mismatch - Expected: {stored_otp['otp']}, Got: {otp}")
        return jsonify({'error': 'Invalid OTP code'}), 400
    
    users[email]['verified'] = True
    del otp_store[email]
    print("Success: OTP verified successfully")
    print(f"========================\n")
    
    return jsonify({'message': 'OTP verified successfully'})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    
    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400
    
    user = users.get(email)
    if not user:
        return jsonify({'error': 'Invalid email or password'}), 400
        
    if not user['verified']:
        return jsonify({'error': 'Account not verified. Please complete registration.'}), 400
    
    if not check_password_hash(user['password'], password):
        return jsonify({'error': 'Invalid email or password'}), 400
    
    if user['face_registered']:
        return jsonify({'requiresFaceVerification': True, 'email': email})
    elif user['two_factor_enabled']:
        return jsonify({'requiresTwoFactor': True, 'email': email})
    else:
        return jsonify({'requires2FASetup': True, 'email': email})

@app.route('/api/setup-2fa', methods=['POST'])
def setup_2fa():
    data = request.get_json()
    email = data.get('email')
    
    user = users.get(email)
    if not user:
        return jsonify({'error': 'User not found'}), 400
    
    secret = pyotp.random_base32()
    users[email]['two_factor_secret'] = secret
    
    # Generate QR code
    totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=email,
        issuer_name="Bank Portal"
    )
    
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(totp_uri)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    
    qr_code_data = base64.b64encode(buffer.getvalue()).decode()
    qr_code_url = f"data:image/png;base64,{qr_code_data}"
    
    return jsonify({'qrCode': qr_code_url, 'secret': secret})

@app.route('/api/verify-2fa', methods=['POST'])
def verify_2fa():
    data = request.get_json()
    email = data.get('email')
    token = data.get('token')
    
    user = users.get(email)
    if not user or not user['two_factor_secret']:
        return jsonify({'error': 'User not found or 2FA not set up'}), 400
    
    totp = pyotp.TOTP(user['two_factor_secret'])
    print(f"2FA verification - Email: {email}, Token: {token}")
    print(f"Expected token: {totp.now()}")
    
    # Allow some time window for verification
    if not totp.verify(token, valid_window=2):
        print(f"2FA verification failed for {email}")
        return jsonify({'error': 'Invalid 2FA token'}), 400
    
    users[email]['two_factor_enabled'] = True
    
    jwt_token = jwt.encode({
        'email': email,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=1)
    }, app.config['SECRET_KEY'], algorithm='HS256')
    
    return jsonify({'token': jwt_token, 'message': '2FA verified successfully', 'username': user.get('username', user['email'].split('@')[0])})

@app.route('/api/register-face', methods=['POST'])
def register_face():
    data = request.get_json()
    email = data.get('email')
    face_data_url = data.get('faceData')
    
    if not email or not face_data_url:
        return jsonify({'error': 'Email and face data required'}), 400
    
    user = users.get(email)
    if not user:
        return jsonify({'error': 'User not found'}), 400
    
    try:
        # Extract and decode image
        face_data_b64 = face_data_url.split(',')[1]
        img_data = base64.b64decode(face_data_b64)
        img_array = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        
        # Use Haar cascade for face detection
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.1, 4)
        
        if len(faces) == 0:
            return jsonify({'error': 'No face detected in image'}), 400
        
        # Store face template for comparison
        x, y, w, h = faces[0]
        face_roi = cv2.resize(gray[y:y+h, x:x+w], (100, 100))
        face_data[email] = face_roi.flatten().tolist()
        users[email]['face_registered'] = True
        
        return jsonify({'message': 'Face registered successfully'})
    except Exception as e:
        return jsonify({'error': 'Face registration failed'}), 400

@app.route('/api/verify-face', methods=['POST'])
def verify_face():
    data = request.get_json()
    email = data.get('email')
    face_data_url = data.get('faceData')
    
    if not email or not face_data_url:
        return jsonify({'error': 'Email and face data required'}), 400
    
    user = users.get(email)
    if not user or not user['face_registered']:
        return jsonify({'error': 'Face not registered for this user'}), 400
    
    try:
        # Extract and decode current image
        face_data_b64 = face_data_url.split(',')[1]
        img_data = base64.b64decode(face_data_b64)
        img_array = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        
        # Use Haar cascade for face detection
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.1, 4)
        
        if len(faces) == 0:
            return jsonify({'error': 'No face detected in image'}), 400
        
        # Compare face with registered template using template matching
        x, y, w, h = faces[0]
        current_face = cv2.resize(gray[y:y+h, x:x+w], (100, 100))
        stored_face = np.array(face_data.get(email)).reshape(100, 100).astype(np.uint8)
        
        # Use template matching for better accuracy
        result = cv2.matchTemplate(current_face, stored_face, cv2.TM_CCOEFF_NORMED)
        max_val = np.max(result)
        
        if max_val > 0.7:
            if user['two_factor_enabled']:
                return jsonify({'requiresTwoFactor': True, 'email': email})
            else:
                return jsonify({'requires2FASetup': True, 'email': email})
        else:
            return jsonify({'error': 'Face verification failed - unauthorized person'}), 401
            
    except Exception as e:
        return jsonify({'error': 'Face verification failed'}), 401

@app.route('/api/dashboard', methods=['GET'])
@token_required
def dashboard(current_user):
    return jsonify({
        'message': 'Welcome to your dashboard',
        'user': {
            'name': current_user['name'],
            'email': current_user['email'],
            'phone': current_user['phone'],
            'accountNumber': current_user['accountNumber'],
            'ifscCode': current_user['ifscCode']
        }
    })

if __name__ == '__main__':
    print("Starting Flask server on port 5000...")
    print("OTP codes will be displayed in this console.")
    print("Face verification enabled.")
    app.run(debug=True, port=5000)