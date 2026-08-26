from flask import Flask, request, jsonify, send_from_directory
from flask_mail import Mail, Message
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
import random
import datetime
from functools import wraps

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'

# Email configuration
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = 'your-email@gmail.com'  # Change this
app.config['MAIL_PASSWORD'] = 'your-app-password'     # Change this

mail = Mail(app)

# In-memory storage
users = {}
otp_store = {}

def send_otp_email(email, otp):
    try:
        msg = Message(
            'SecureBank - OTP Verification',
            sender=app.config['MAIL_USERNAME'],
            recipients=[email]
        )
        msg.body = f'Your OTP code is: {otp}\n\nThis code will expire in 5 minutes.'
        mail.send(msg)
        return True
    except:
        print(f"Email failed, OTP for {email}: {otp}")
        return False

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
        'two_factor_enabled': False
    }
    
    # Send OTP via email
    if send_otp_email(email, otp):
        message = 'Registration initiated. Please check your email for OTP.'
    else:
        message = f'Registration initiated. OTP: {otp} (Email service unavailable)'
    
    return jsonify({'message': message, 'email': email})

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
    
    token = jwt.encode({
        'email': email,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=1)
    }, app.config['SECRET_KEY'], algorithm='HS256')
    
    return jsonify({'token': token, 'message': 'Login successful'})

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