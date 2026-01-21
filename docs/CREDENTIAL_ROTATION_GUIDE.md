# Credential Rotation Guide

**URGENT:** Your credentials were exposed in `.env.example` on GitHub. Follow these steps immediately.

## Exposed Credentials That MUST Be Rotated

| Service                | Exposed Value        | Status         |
| ---------------------- | -------------------- | -------------- |
| AWS Access Key         | `AKIA***REDACTED***` | **ROTATE NOW** |
| AWS Access Key (local) | `AKIA***REDACTED***` | **ROTATE NOW** |

---

## Step 1: AWS Credentials (CRITICAL)

### Rotate Immediately:

1. **Go to AWS Console**: https://console.aws.amazon.com/iam/
2. **Navigate to**: IAM → Users → Your User → Security Credentials
3. **Create new access key**:
   - Click "Create access key"
   - Download the new credentials
   - Save them securely (password manager)
4. **Deactivate OLD keys**:
   - Find and deactivate any exposed AWS access keys
   - Click "Make inactive"
   - After confirming your app works with new keys, delete the old ones
5. **Check for unauthorized usage**:
   - Go to CloudTrail → Event History
   - Filter by Access Key ID
   - Look for suspicious activity

### Update your local `.env`:

```bash
AWS_ACCESS_KEY_ID=<your-new-access-key>
AWS_SECRET_ACCESS_KEY=<your-new-secret-key>
```

---

## Step 2: Twilio Credentials

1. **Go to Twilio Console**: https://console.twilio.com/
2. **Navigate to**: Account → API Keys & Tokens
3. **Regenerate Auth Token**:
   - Click "Regenerate Auth Token" in the Account Info section
   - Note: This will invalidate the old token immediately
4. **Update your local `.env`**:

```bash
TWILIO_AUTH_TOKEN=<your-new-auth-token>
```

---

## Step 3: Stripe Credentials

1. **Go to Stripe Dashboard**: https://dashboard.stripe.com/apikeys
2. **Roll your API keys**:
   - Click "Roll key" on your Secret Key
   - Choose an expiration for the old key (24 hours recommended)
3. **Regenerate Webhook Secret**:
   - Go to Developers → Webhooks
   - Click on your webhook endpoint
   - Click "Reveal" then "Roll secret"
4. **Update your local `.env`**:

```bash
STRIPE_SECRET_KEY=sk_test_<new-key>
STRIPE_WEBHOOK_SECRET=whsec_<new-secret>
```

---

## Step 4: Cloudinary Credentials

1. **Go to Cloudinary Console**: https://console.cloudinary.com/settings/api-keys
2. **Regenerate API Secret**:
   - Click on the gear icon next to your API key
   - Select "Regenerate"
3. **Update your local `.env`**:

```bash
CLOUDINARY_API_SECRET=<your-new-secret>
```

---

## Step 5: JWT Secrets

Generate new strong secrets:

```bash
# Generate new JWT secrets (run in terminal)
echo "JWT_ACCESS_SECRET=$(openssl rand -base64 64 | tr -d '\n')"
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 64 | tr -d '\n')"
```

Update your local `.env` with the generated values.

**Note:** Changing JWT secrets will invalidate all existing user sessions. Users will need to log in again.

---

## Step 6: Verify No Unauthorized Access

### AWS

```bash
# Check recent API calls (requires AWS CLI)
# Replace YOUR_ACCESS_KEY_ID with your actual exposed key
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=YOUR_ACCESS_KEY_ID \
  --start-time $(date -v-7d +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date +%Y-%m-%dT%H:%M:%SZ)
```

### Stripe

- Go to Stripe Dashboard → Logs
- Check for any unauthorized API calls

### Twilio

- Go to Twilio Console → Monitor → Logs
- Check for unauthorized SMS sends

---

## Step 7: Update Production Environment

If you have deployed to production:

1. Update environment variables in your hosting provider (AWS, Heroku, Vercel, etc.)
2. Restart all services
3. Test authentication and integrations

---

## Prevention: Best Practices

1. **Never commit `.env` files** - Already in `.gitignore` ✅
2. **Use `.env.example` with placeholders only** - Fixed ✅
3. **Use secrets manager in production**:
   - AWS Secrets Manager
   - HashiCorp Vault
   - Doppler
4. **Enable AWS CloudTrail** for audit logging
5. **Set up billing alerts** in AWS to detect unauthorized usage
6. **Use IAM roles** instead of access keys when possible

---

## Checklist

- [ ] AWS Access Keys rotated
- [ ] Twilio Auth Token regenerated
- [ ] Stripe API Key rolled
- [ ] Stripe Webhook Secret regenerated
- [ ] Cloudinary API Secret regenerated
- [ ] JWT Secrets regenerated
- [ ] Local `.env` updated with new credentials
- [ ] Production environment updated
- [ ] Verified no unauthorized access in logs
- [ ] All services tested and working

---

## Emergency Contacts

If you detect unauthorized access:

- **AWS**: https://aws.amazon.com/security/vulnerability-reporting/
- **Stripe**: security@stripe.com
- **Twilio**: security@twilio.com
