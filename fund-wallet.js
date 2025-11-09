/**
 * Fund Wallet Script - Run when creating a funding pool
 * Sets up incoming payment and quote, returns grant info to store
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
    receivingWalletAddressUrl,
    amount, // in cents
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

  // Step 2: Get incoming payment grant
  const incomingPaymentGrant = await client.grant.request(
    {
      url: receivingWalletAddress.authServer
    },
    {
      access_token: {
        access: [
          {
            type: 'incoming-payment',
            actions: ['read', 'complete', 'create']
          }
        ]
      }
    }
  )

  if (!isFinalizedGrant(incomingPaymentGrant)) {
    throw new Error('Expected finalized incoming payment grant')
  }

  console.log('✓ Step 2: Got incoming payment grant')

  // Step 3: Create incoming payment
  const incomingPayment = await client.incomingPayment.create(
    {
      url: receivingWalletAddress.resourceServer,
      accessToken: incomingPaymentGrant.access_token.value
    },
    {
      walletAddress: receivingWalletAddress.id,
      incomingAmount: {
        assetCode: receivingWalletAddress.assetCode,
        assetScale: receivingWalletAddress.assetScale,
        value: amount.toString()
      }
    }
  )

  console.log('✓ Step 3: Created incoming payment')

  // Step 4: Get quote grant
  const quoteGrant = await client.grant.request(
    {
      url: sendingWalletAddress.authServer
    },
    {
      access_token: {
        access: [
          {
            type: 'quote',
            actions: ['create', 'read']
          }
        ]
      }
    }
  )

  if (!isFinalizedGrant(quoteGrant)) {
    throw new Error('Expected finalized quote grant')
  }

  console.log('✓ Step 4: Got quote grant')

  // Step 5: Create quote
  const quote = await client.quote.create(
    {
      url: sendingWalletAddress.resourceServer,
      accessToken: quoteGrant.access_token.value
    },
    {
      walletAddress: sendingWalletAddress.id,
      receiver: incomingPayment.id,
      method: 'ilp'
    }
  )

  console.log('✓ Step 5: Created quote')

 // Step 6: Request outgoing payment grant (interactive)
  // Step 6: Request outgoing payment grant (interactive)
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
            value: amount.toString()
          }
        },
        identifier: sendingWalletAddress.id
      }
    ]
  },
  interact: {
    start: ['redirect'],
    finish: {
      method: 'redirect',
      uri: callbackUrl,  // Service callback URL
      nonce: crypto.randomUUID()
    }
  }
}
  
  // Add finish callback if provided
  if (callbackUrl) {
    grantRequest.interact.finish = {
      method: 'redirect',
      uri: callbackUrl,
      nonce: crypto.randomUUID()
    }
  }
  
  const outgoingPaymentGrant = await client.grant.request(
    { url: sendingWalletAddress.authServer },
    grantRequest
  )

  console.log('✓ Step 6: Got pending outgoing payment grant')

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
    quoteId: quote.id,
    incomingPaymentId: incomingPayment.id,
    sendingWalletAddress: sendingWalletAddress.id,
    receivingWalletAddress: receivingWalletAddress.id
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