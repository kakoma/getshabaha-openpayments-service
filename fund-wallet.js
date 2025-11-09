/**
 * Fund Wallet Script - Run when creating a funding pool
 * Gets grant authorization for multiple future payments
 */

import {
  createAuthenticatedClient,
  isFinalizedGrant
} from '@interledger/open-payments'
import crypto from 'crypto'

export async function fundWallet(config) {
  const {
    privateKeyPath,
    keyId,
    clientWalletAddressUrl,
    sendingWalletAddressUrl,
    receivingWalletAddressUrl, // Platform wallet
    amount, // Total pool amount in cents
    callbackUrl
  } = config

  const client = await createAuthenticatedClient({
    walletAddressUrl: clientWalletAddressUrl,
    keyId: keyId,
    privateKey: privateKeyPath
  })

  // Step 1: Get wallet addresses
  const sendingWalletAddress = await client.walletAddress.get({
    url: sendingWalletAddressUrl
  })
  
  const receivingWalletAddress = await client.walletAddress.get({
    url: receivingWalletAddressUrl
  })

  console.log('✓ Step 1: Got wallet addresses')

  // Step 2: Request outgoing payment grant for the TOTAL pool amount
  // This grant will be used for multiple student disbursements
  const grantRequest = {
    access_token: {
      access: [
        {
          type: 'outgoing-payment',
          actions: ['read', 'create', 'list'],
          limits: {
            debitAmount: {
              assetCode: sendingWalletAddress.assetCode,
              assetScale: sendingWalletAddress.assetScale,
              value: amount.toString() // Total pool amount
            }
          },
          identifier: sendingWalletAddress.id
        }
      ]
    },
    interact: {
      start: ['redirect']
    }
  }

  // Add finish callback if provided
  if (callbackUrl) {
    try {
      new URL(callbackUrl)
      grantRequest.interact.finish = {
        method: 'redirect',
        uri: callbackUrl,
        nonce: crypto.randomUUID()
      }
      console.log('Added finish callback:', callbackUrl)
    } catch (err) {
      console.warn('Invalid callback URL, continuing without finish redirect:', err.message)
    }
  }

  const outgoingPaymentGrant = await client.grant.request(
    { url: sendingWalletAddress.authServer },
    grantRequest
  )

  console.log('✓ Step 2: Got pending outgoing payment grant')

  // Return data to store in WordPress database
  return {
    status: 'success',
    grant: {
      interact: {
        redirect: outgoingPaymentGrant.interact.redirect,
        finish: outgoingPaymentGrant.interact.finish
      },
      continue: {
        access_token: {
          value: outgoingPaymentGrant.continue.access_token.value
        },
        uri: outgoingPaymentGrant.continue.uri,
        wait: 1
      }
    },
    sendingWalletAddress: sendingWalletAddress.id,
    receivingWalletAddress: receivingWalletAddress.id,
    totalPoolAmount: amount
  }
}

// If running directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      const config = {
        privateKeyPath: 'general-test-private.key',
        keyId: 'b4fe7d1d-76bc-4290-b280-eba1f3021b9f',
        clientWalletAddressUrl: 'https://ilp.interledger-test.dev/388aba51',
        sendingWalletAddressUrl: 'https://ilp.interledger-test.dev/388aba51',
        receivingWalletAddressUrl: 'https://ilp.interledger-test.dev/f42a647f',
        amount: 100000, // $1000.00 in cents
        callbackUrl: 'http://localhost:8888/wp-admin/admin.php?page=shabaha-pools&auth_complete=1&pool_id=1'
      }

      const result = await fundWallet(config)
      console.log('\n📦 RESULT TO STORE IN DATABASE:')
      console.log(JSON.stringify(result, null, 2))
      
      console.log('\n⚠️  IMPORTANT: Funder must visit this URL to authorize:')
      console.log(result.grant.interact.redirect)
      
    } catch (error) {
      console.error('❌ Error:', error.message)
      process.exit(1)
    }
  })()
}

// If running directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      const config = {
        privateKeyPath: 'general-test-private.key',
        keyId: 'b4fe7d1d-76bc-4290-b280-eba1f3021b9f',
        clientWalletAddressUrl: 'https://ilp.interledger-test.dev/388aba51',
        sendingWalletAddressUrl: 'https://ilp.interledger-test.dev/388aba51',
        receivingWalletAddressUrl: 'https://ilp.interledger-test.dev/f42a647f',
        amount: 100000 // $1000.00 in cents
      }

      const result = await fundWallet(config)
      console.log('\n📦 RESULT TO STORE IN DATABASE:')
      console.log(JSON.stringify(result, null, 2))
      
      console.log('\n⚠️  IMPORTANT: Funder must visit this URL to authorize:')
      console.log(result.grant.interact.redirect)
      
    } catch (error) {
      console.error('❌ Error:', error.message)
      process.exit(1)
    }
  })()
}