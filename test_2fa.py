import pyotp

# Test 2FA generation
secret = pyotp.random_base32()
print(f"Secret: {secret}")

totp = pyotp.TOTP(secret)
current_code = totp.now()
print(f"Current TOTP code: {current_code}")

# Test verification
is_valid = totp.verify(current_code, valid_window=2)
print(f"Code verification: {is_valid}")

# Generate QR URI
uri = totp.provisioning_uri(
    name="test@example.com",
    issuer_name="Bank Portal"
)
print(f"QR URI: {uri}")