import express from 'express'
import 'dotenv/config'
import fs from 'fs'
import { fundWallet } from './fund-wallet.js'
import { processDisbursement } from './disbursement.js'
import { createAuthenticatedClient, isFinalizedGrant } from '@interledger/open-payments'

const app = express()
app.use(express.json())

const DEFAULT_CONFIG = {
  privateKeyPath: 'general-test-private.key',
  keyId: 'b4fe7d1d-76bc-4290-b280-eba1f3021b9f',
  clientWalletAddressUrl: 'https://ilp.interledger-test.dev/388aba51',
  sendingWalletAddressUrl: 'https://ilp.interledger-test.dev/388aba51'
}

// Simple in-memory storage for grants (or use a JSON file)
const grants = new Map()

// Helper to save grants to file (persists across restarts)
function saveGrants() {
  fs.writeFileSync('grants.json', JSON.stringify(Array.from(grants.entries())))
}

function loadGrants() {
  if (fs.existsSync('grants.json')) {
    const data = JSON.parse(fs.readFileSync('grants.json', 'utf8'))
    data.forEach(([key, value]) => grants.set(key, value))
    console.log(`📂 Loaded ${grants.size} grants from storage`)
  }
}

// Load grants on startup
loadGrants()

// POST /kanzu/fund-wallet
app.post('/kanzu/fund-wallet', async (req, res) => {
  try {
    const { fromWallet, toWallet, transactionAmount, poolId } = req.body

    console.log('📥 Fund wallet request for pool:', poolId)

    // Callback goes to SERVICE (not WordPress)
    const serviceUrl = process.env.SERVICE_URL || `http://localhost:${PORT}`
    const callbackUrl = `${serviceUrl}/kanzu/grant-callback?pool_id=${poolId}`

    const result = await fundWallet({
      ...DEFAULT_CONFIG,
      sendingWalletAddressUrl: fromWallet,
      receivingWalletAddressUrl: toWallet,
      amount: transactionAmount,
      callbackUrl: callbackUrl
    })

    // Store grant info
    grants.set(poolId.toString(), {
      continueUri: result.grant.continue.uri,
      continueAccessToken: result.grant.continue.access_token.value,
      sendingWalletAddress: fromWallet,
      receivingWalletAddress: toWallet,
      poolId: poolId,
      isAuthorized: false,  // Not yet authorized
      createdAt: new Date().toISOString()
    })
    
    saveGrants()
    
    console.log(`✅ Grant stored for pool ${poolId}`)

    res.json(result)
  } catch (error) {
    console.error('❌ Fund wallet error:', error)
    res.status(500).json({
      status: 'error',
      message: error.message
    })
  }
})

// GET /kanzu/grant-callback - Interledger redirects here after authorization
app.get('/kanzu/grant-callback', async (req, res) => {
  try {
    const { interact_ref, pool_id } = req.query  // Get interact_ref from callback

    console.log('📥 Grant callback - Authorization complete')
    console.log('   Pool ID:', pool_id)
    
    const grantInfo = grants.get(pool_id.toString())
    
    if (!grantInfo) {
      return res.status(404).send('Grant not found')
    }

    // STORE the interact_ref
    grantInfo.interact_ref = interact_ref
    grantInfo.isAuthorized = true
    grants.set(pool_id.toString(), grantInfo)
    saveGrants()

    console.log('✅ Authorization captured')

    // Redirect to WordPress
    const wordpressUrl = process.env.WORDPRESS_BASE_URL
    res.redirect(`${wordpressUrl}/wp-admin/admin.php?page=shabaha-pools&auth_complete=1&pool_id=${pool_id}`)
  } catch (error) {
    console.error('❌ Callback error:', error)
    res.status(500).send('Error: ' + error.message)
  }
})

// POST /kanzu/disbursement
app.post('/kanzu/disbursement', async (req, res) => {
  try {
    const { studentWalletAddress, debitAmount, id, StudentName, poolId } = req.body

    console.log('📥 Disbursement request')
    console.log('   Transaction ID:', id)
    console.log('   Student:', StudentName)
    const grantInfo = grants.get(poolId.toString())
    
    if (!grantInfo) {
      throw new Error(`Grant not found for pool ${poolId}`)
    }

    if (!grantInfo.isAuthorized || !grantInfo.interact_ref) {
      throw new Error('Pool not authorized yet. Please authorize first.')
    }

    console.log(`✓ Using authorized grant from pool ${poolId}`)

    const result = await processDisbursement({
      ...DEFAULT_CONFIG,
      continueUri: grantInfo.continueUri,
      continueAccessToken: grantInfo.continueAccessToken,
      interact_ref: grantInfo.interact_ref,  // Pass interact_ref
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