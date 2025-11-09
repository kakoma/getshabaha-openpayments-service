# Shabaha Open Payments Service

Node.js service that handles Interledger Open Payments API integration for the Shabaha learning incentives platform. Processes real-time cryptocurrency payments from funders to students based on learning achievements.

## 🎯 Overview

This service acts as a backend payment processor that:
- Creates Interledger payment grants with specific amounts
- Manages interactive authorization flows
- Completes payments automatically after funder approval
- Provides secure callback handling for payment confirmation

## 🏗️ Architecture

```
WordPress Plugin → Open Payments Service → Interledger Network
                        ↓
                   Funder Authorization
                        ↓
                   Payment Completion
```

### Payment Flow

1. **Payment Initiation**: WordPress calls `/kanzu/create-payment`
2. **Grant Creation**: Service creates incoming payment, quote, and outgoing payment grant
3. **Authorization**: Funder receives URL and approves payment
4. **Callback**: Interledger redirects to `/kanzu/payment-callback`
5. **Completion**: Service finalizes grant and executes payment
6. **Confirmation**: WordPress receives success/failure notification

## 📋 Requirements

- Node.js 18+ 
- npm or yarn
- Interledger wallet with Open Payments API support
- Private key for wallet authentication
- WordPress with Shabaha plugin installed

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/kakoma/getshabaha-openpayments-service.git
cd getshabaha-openpayments-service
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Service Configuration
PORT=3000
SERVICE_URL=http://localhost:3000
WORDPRESS_BASE_URL=http://your-wordpress-site.com

# Interledger Wallet Configuration
CLIENT_WALLET_ADDRESS=https://your-wallet-provider.com/your-wallet
KEY_ID=your-key-id-from-wallet-provider
PRIVATE_KEY_PATH=./private-key.pem

# Default Sending Wallet (Funder's Wallet)
SENDING_WALLET_ADDRESS=https://wallet-provider.com/funder-payment-pointer
```

### 3. Add Private Key

```bash
# Copy your Interledger private key to the project root
cp /path/to/your/private-key.pem ./private-key.pem

# Secure it (Unix/Mac)
chmod 600 private-key.pem
```

### 4. Start Service

```bash
npm start
```

Expected output:
```
🚀 Open Payments service running on http://localhost:3000
📂 Loaded 0 pending payments
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Service port | `3000` |
| `SERVICE_URL` | Public URL of this service | `http://localhost:3000` or `https://payments.yoursite.com` |
| `WORDPRESS_BASE_URL` | WordPress installation URL | `http://localhost:8888` |
| `CLIENT_WALLET_ADDRESS` | Your Interledger wallet address | `https://ilp.rafiki.money/alice` |
| `KEY_ID` | Wallet authentication key ID | `abc-123-def` |
| `PRIVATE_KEY_PATH` | Path to private key file | `./private-key.pem` |
| `SENDING_WALLET_ADDRESS` | Default funder wallet address | `https://ilp.rafiki.money/funder` |

### Getting Interledger Credentials

1. **Create Wallet**: Sign up at an Interledger wallet provider (e.g., Rafiki, Fynbos)
2. **Generate Keys**: Create API key pair in wallet dashboard
3. **Download Private Key**: Save as `private-key.pem`
4. **Copy Key ID**: Note the key identifier
5. **Get Payment Pointer**: Copy your wallet's payment pointer URL

## 📡 API Endpoints

### POST `/kanzu/create-payment`

Creates a new payment request and returns authorization URL for funder.

**Request Body:**
```json
{
  "studentWalletAddress": "https://wallet-provider.com/student-wallet",
  "debitAmount": 500,
  "id": 1,
  "StudentName": "Jane Doe",
  "poolId": 15
}
```

**Parameters:**
- `studentWalletAddress` (string, required): Student's Interledger payment pointer
- `debitAmount` (integer, required): Amount in smallest currency unit (cents)
- `id` (integer, required): Transaction ID from WordPress
- `StudentName` (string, optional): Student name for logging
- `poolId` (integer, optional): Funding pool ID (for future use)

**Success Response:**
```json
{
  "status": "pending",
  "authUrl": "https://wallet-provider.com/auth?grant=xyz",
  "transactionId": 1,
  "message": "Funder authorization required"
}
```

**Error Response:**
```json
{
  "status": "error",
  "message": "Error description"
}
```

**Process:**
1. Gets sending and receiving wallet addresses
2. Creates incoming payment grant for student
3. Creates incoming payment
4. Creates quote grant
5. Creates quote for the transfer
6. Requests interactive outgoing payment grant
7. Stores payment info in `pending-payments.json`
8. Returns authorization URL

### GET `/kanzu/payment-callback`

Callback endpoint that completes payment after funder authorization.

**Query Parameters:**
- `interact_ref` (string): Interaction reference from Interledger
- `txId` (integer): Transaction ID

**Example:**
```
http://localhost:3000/kanzu/payment-callback?interact_ref=abc123&txId=1
```

**Process:**
1. Retrieves pending payment info
2. Continues grant with `interact_ref` to finalize it
3. Creates outgoing payment using finalized grant
4. Removes payment from pending queue
5. Redirects to WordPress success/failure page

**Redirect URLs:**
- Success: `{WORDPRESS_BASE_URL}/wp-admin/admin.php?page=shabaha-conversion&payment_complete=1&tx_id={txId}`
- Failure: `{WORDPRESS_BASE_URL}/wp-admin/admin.php?page=shabaha-conversion&payment_failed=1&error={message}`

## 📂 File Structure

```
getshabaha-openpayments-service/
├── server.js                    # Main Express server with endpoints
├── disbursement.js              # Legacy payment logic (not used)
├── fund-wallet.js               # Pool funding logic (optional)
├── package.json                 # Dependencies
├── .env                         # Environment configuration
├── private-key.pem              # Interledger private key (gitignored)
├── pending-payments.json        # Pending payment storage
└── README.md                    # This file
```

## 💾 Data Storage

### pending-payments.json

Stores payment info between creation and completion:

```json
[
  [
    "1",
    {
      "continueUri": "https://auth.wallet.com/continue/xyz",
      "continueAccessToken": "token-abc-123",
      "quoteId": "quote-123",
      "sendingWalletAddressUrl": "https://wallet.com/funder",
      "studentName": "Jane Doe",
      "amount": 500,
      "createdAt": "2025-11-09T10:30:00.000Z"
    }
  ]
]
```

**Note**: This file persists between restarts. Delete it to clear pending payments.

## 🔐 Security

### Private Key Management

```bash
# Never commit private key
echo "private-key.pem" >> .gitignore

# Secure file permissions
chmod 600 private-key.pem

# Use environment variables in production
export PRIVATE_KEY_PATH=/secure/path/to/key.pem
```

### Authorization Flow

- Each payment requires explicit funder approval
- Grants are single-use only
- Interactive authorization via OAuth-style redirect
- `interact_ref` validates authorization authenticity

### Best Practices

- Use HTTPS in production (`SERVICE_URL` and `WORDPRESS_BASE_URL`)
- Rotate private keys periodically
- Monitor `pending-payments.json` for stale entries
- Implement rate limiting for production
- Add request validation middleware

## 🐛 Troubleshooting

### Service Won't Start

**Port already in use:**
```bash
# Find process using port 3000
lsof -i :3000

# Kill it
kill -9 <PID>

# Or use different port
PORT=3001 npm start
```

**Missing dependencies:**
```bash
rm -rf node_modules package-lock.json
npm install
```

### "Grant cannot be polled" Error

**Cause**: Trying to reuse a grant that was already finalized.

**Solution**:
1. Each payment needs a fresh grant
2. Student must initiate a new claim
3. Delete stale entries from `pending-payments.json`

```bash
# Clear pending payments
rm pending-payments.json
npm start
```

### Authentication Errors

**"Invalid key" or "Unauthorized":**
- Verify `KEY_ID` matches wallet provider
- Check `PRIVATE_KEY_PATH` points to correct file
- Ensure private key format is correct (PEM)
- Confirm `CLIENT_WALLET_ADDRESS` is accurate

### Callback Not Triggering

**Check callback URL accessibility:**
```bash
# Test callback endpoint
curl http://localhost:3000/kanzu/payment-callback?txId=test
```

**Common issues:**
- `SERVICE_URL` not publicly accessible (use ngrok for local testing)
- Firewall blocking incoming requests
- Wallet provider can't reach localhost (use public URL)

### Payment Stuck in Pending

**Check payment status:**
```bash
# View pending payments
cat pending-payments.json | jq
```

**Common causes:**
- Funder didn't complete authorization
- Callback URL unreachable
- Grant expired (typically 10-15 minutes)

**Solution**: Have student initiate a new claim.

## 🧪 Testing

### Local Testing with ngrok

```bash
# Start ngrok tunnel
ngrok http 3000

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
# Update .env
SERVICE_URL=https://abc123.ngrok.io

# Restart service
npm start
```

### Test Payment Flow

```bash
# 1. Create payment
curl -X POST http://localhost:3000/kanzu/create-payment \
  -H "Content-Type: application/json" \
  -d '{
    "studentWalletAddress": "https://wallet.com/student",
    "debitAmount": 500,
    "id": 999,
    "StudentName": "Test Student"
  }'

# 2. Visit authUrl in browser and authorize
# 3. Callback triggers automatically
# 4. Check logs for "Payment completed!"
```

### Manual Callback Test

```bash
# Simulate callback (requires valid interact_ref)
curl "http://localhost:3000/kanzu/payment-callback?interact_ref=test123&txId=999"
```

## 📊 Logging

Service logs include:

- `📥` Incoming requests
- `✓` Successful steps
- `✅` Completed operations
- `❌` Errors
- `ℹ️` Informational messages

**Example output:**
```
📥 Create payment request
   Transaction ID: 1
   Student: Jane Doe
   Amount: $5.00
✓ Step 1: Got wallet addresses
✓ Step 2: Got incoming payment grant
✓ Step 3: Created incoming payment
✓ Step 4: Got quote grant
✓ Step 5: Created quote
✓ Step 6: Got pending grant
✅ Payment created - awaiting authorization

📥 Payment callback received
   Transaction ID: 1
   Interact ref: abc123
🔄 Finalizing grant...
✓ Step 7: Grant finalized
✅ Step 8: Payment completed!
   Student: Jane Doe
   Amount: $5.00
   Outgoing Payment ID: op_xyz789
```

## 🚀 Production Deployment

### Environment Setup

```bash
# Use production URLs
SERVICE_URL=https://payments.yoursite.com
WORDPRESS_BASE_URL=https://yoursite.com

# Use secrets manager for private key
PRIVATE_KEY_PATH=/var/secrets/interledger-key.pem
```

### Using PM2 (Process Manager)

```bash
# Install PM2
npm install -g pm2

# Start service
pm2 start server.js --name shabaha-payments

# View logs
pm2 logs shabaha-payments

# Restart
pm2 restart shabaha-payments

# Auto-start on reboot
pm2 startup
pm2 save
```

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

```bash
# Build
docker build -t shabaha-payments .

# Run
docker run -d \
  -p 3000:3000 \
  -v /secure/keys:/keys:ro \
  -e PRIVATE_KEY_PATH=/keys/private-key.pem \
  --name shabaha-payments \
  shabaha-payments
```

### Monitoring

```bash
# Check service health
curl http://localhost:3000/health

# Monitor logs
tail -f logs/service.log

# PM2 monitoring
pm2 monit
```

## 🔄 Updates and Maintenance

### Update Dependencies

```bash
# Check for updates
npm outdated

# Update packages
npm update

# Update Open Payments client
npm install @interledger/open-payments@latest
```

### Backup

```bash
# Backup pending payments
cp pending-payments.json pending-payments.backup.json

# Backup environment
cp .env .env.backup
```

## 📚 Dependencies

- `express`: Web server framework
- `@interledger/open-payments`: Interledger API client
- `dotenv`: Environment variable management
- `cors`: Cross-origin resource sharing

## 🤝 Integration with WordPress

This service is designed to work with the [Shabaha WordPress plugin](https://github.com/kakoma/getshabaha).

**WordPress calls service:**
- Creates payment: `POST /kanzu/create-payment`
- Receives callback: Service redirects to WordPress

**Required WordPress endpoint:**
- Success: `/wp-admin/admin.php?page=shabaha-conversion&payment_complete=1`
- Failure: `/wp-admin/admin.php?page=shabaha-conversion&payment_failed=1`

## 📝 License

MIT License

## 🏆 Built For

**Interledger Hackathon Mexico City 2025**  
**Team: Kanzu Code Foundation**

## 📞 Support

- GitHub Issues: [Create an issue](https://github.com/kakoma/getshabaha-openpayments-service/issues)
- Documentation: [Interledger Docs](https://docs.interledger.org)
- Open Payments Spec: [Open Payments](https://openpayments.guide)

---

**Note**: This is a hackathon MVP using a "one grant per payment" model. Each student payment requires individual funder authorization via interactive redirect flow.
