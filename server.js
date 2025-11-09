import express from 'express'
import { fundWallet } from './fund-wallet.js'
import { processDisbursement } from './disbursement.js'
import 'dotenv/config'

const app = express()
app.use(express.json())

// Configuration - you could move this to environment variables
const DEFAULT_CONFIG = {
  privateKeyPath: 'general-test-private.key',
  keyId: 'b4fe7d1d-76bc-4290-b280-eba1f3021b9f',
  clientWalletAddressUrl: 'https://ilp.interledger-test.dev/388aba51',
  sendingWalletAddressUrl: 'https://ilp.interledger-test.dev/388aba51'
}

// POST /kanzu/fund-wallet
app.post('/kanzu/fund-wallet', async (req, res) => {
  try {
    const { fromWallet, toWallet, transactionAmount, poolId } = req.body
    const wordpressUrl = process.env.WORDPRESS_BASE_URL
    const callbackUrl = `${wordpressUrl}/wp-admin/admin.php?page=shabaha-pools&auth_complete=1&pool_id=${poolId}`

    const result = await fundWallet({
      ...DEFAULT_CONFIG,
      //sendingWalletAddressUrl: fromWallet, @TODO Temp disable this override by the API
      receivingWalletAddressUrl: toWallet,
      amount: transactionAmount,
      callbackUrl: callbackUrl
    })

    res.json(result)
  } catch (error) {
    console.error('Fund wallet error:', error)
    res.status(500).json({
      status: 'error',
      message: error.message
    })
  }
})
// POST /kanzu/disbursement - Executes the payment (Step 7)
app.post('/kanzu/disbursement', async (req, res) => {
  try {
    const {
      continueAccessToken,
      continueUri,
      studentWalletAddress,
      id,
      StudentName
    } = req.body

    console.log('📥 Disbursement request for transaction:', id)
    console.log('👤 Student:', StudentName)
    console.log('💳 Student wallet:', studentWalletAddress)

    // Process disbursement using stored grant
    const result = await processDisbursement({
      ...DEFAULT_CONFIG,
      continueUri,
      continueAccessToken
    })

    console.log('✅ Disbursement successful')
    res.json(result)
  } catch (error) {
    console.error('❌ Disbursement error:', error)
    res.status(500).json({
      status: 'error',
      message: error.message,
      description: error.description || null
    })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 Shabaha API server running on http://localhost:${PORT}`)
  console.log(`📍 Endpoints:`)
  console.log(`   POST http://localhost:${PORT}/kanzu/fund-wallet`)
  console.log(`   POST http://localhost:${PORT}/kanzu/disbursement`)
  console.log(`🌐 WordPress URL: ${process.env.WORDPRESS_BASE_URL}`)
})