import express from 'express'
import 'dotenv/config'
import { fundWallet } from './fund-wallet.js'
import { processDisbursement } from './disbursement.js'
import { createAuthenticatedClient, isFinalizedGrant } from '@interledger/open-payments'

const app = express()
app.use(express.json())

// Configuration from environment variables
const DEFAULT_CONFIG = {
  privateKeyPath: 'general-test-private.key',
  keyId: 'b4fe7d1d-76bc-4290-b280-eba1f3021b9f',
  clientWalletAddressUrl: 'https://ilp.interledger-test.dev/388aba51',
  sendingWalletAddressUrl: 'https://ilp.interledger-test.dev/388aba51'
}

// POST /kanzu/fund-wallet - Gets authorization for pool
app.post('/kanzu/fund-wallet', async (req, res) => {
  try {
    const { fromWallet, toWallet, transactionAmount, poolId } = req.body

    console.log('📥 Fund wallet request')
    console.log('   Pool ID:', poolId)
    console.log('   Amount: $' + (transactionAmount / 100).toFixed(2))

    const wordpressUrl = process.env.WORDPRESS_BASE_URL
    const callbackUrl = `${wordpressUrl}/wp-admin/admin.php?page=shabaha-pools&auth_complete=1&pool_id=${poolId}`

    const result = await fundWallet({
      ...DEFAULT_CONFIG,
      //sendingWalletAddressUrl: fromWallet, //@TODO Don't allow this override
      receivingWalletAddressUrl: toWallet,
      amount: transactionAmount,
      callbackUrl: callbackUrl
    })

    console.log('✅ Fund wallet successful')
    res.json(result)
  } catch (error) {
    console.error('❌ Fund wallet error:', error)
    res.status(500).json({
      status: 'error',
      message: error.message
    })
  }
})

// POST /kanzu/finalize-grant - Finalizes grant after funder authorization
app.post('/kanzu/finalize-grant', async (req, res) => {
  try {
    const { continueUri, continueAccessToken } = req.body

    console.log('📥 Finalize grant request')
    console.log('   Continue URI:', continueUri)

    const client = await createAuthenticatedClient({
      walletAddressUrl: DEFAULT_CONFIG.clientWalletAddressUrl,
      keyId: DEFAULT_CONFIG.keyId,
      privateKey: DEFAULT_CONFIG.privateKeyPath
    })

    // Continue the grant to get finalized access token
    const finalizedGrant = await client.grant.continue({
      url: continueUri,
      accessToken: continueAccessToken
    })

    if (!isFinalizedGrant(finalizedGrant)) {
      return res.status(400).json({
        status: 'error',
        message: 'Grant is not finalized yet'
      })
    }

    console.log('✅ Grant finalized successfully')

    res.json({
      status: 'success',
      access_token: finalizedGrant.access_token.value,
      message: 'Grant finalized successfully'
    })
  } catch (error) {
    console.error('❌ Finalize grant error:', error)
    res.status(500).json({
      status: 'error',
      message: error.message
    })
  }
})
app.post('/kanzu/disbursement', async (req, res) => {
  try {
    const {
      continueAccessToken, // This is now the FINALIZED token
      studentWalletAddress,
      debitAmount,
      id,
      StudentName
    } = req.body

    console.log('📥 Disbursement request')
    console.log('   Transaction ID:', id)
    console.log('   Student:', StudentName)
    console.log('   Amount: $' + (debitAmount / 100).toFixed(2))

    const result = await processDisbursement({
      ...DEFAULT_CONFIG,
      finalizedAccessToken: continueAccessToken, // Pass as finalized token
      studentWalletAddressUrl: studentWalletAddress,
      amount: parseInt(debitAmount)
    })

    console.log('✅ Disbursement successful')
    
    res.json(result)
  } catch (error) {
    console.error('❌ Disbursement error:', error)
    res.status(500).json({
      status: 'error',
      message: error.message
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