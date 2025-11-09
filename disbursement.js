/**
 * Disbursement Script - Run when student claims points
 * Creates incoming payment and quote, then uses stored grant for outgoing payment
 */

import {
  createAuthenticatedClient,
  OpenPaymentsClientError,
  isFinalizedGrant
} from '@interledger/open-payments'

export async function processDisbursement(config) {
  const {
    privateKeyPath,
    keyId,
    clientWalletAddressUrl,
    sendingWalletAddressUrl,
    studentWalletAddressUrl,
    amount,
    finalizedAccessToken // Changed from continueUri/continueAccessToken
  } = config

  const client = await createAuthenticatedClient({
    walletAddressUrl: clientWalletAddressUrl,
    keyId: keyId,
    privateKey: privateKeyPath
  })

  console.log('🎯 Starting disbursement for student')
  console.log('   Amount: $' + (amount / 100).toFixed(2))

  // Step 1: Get wallet addresses
  const sendingWalletAddress = await client.walletAddress.get({
    url: sendingWalletAddressUrl
  })
  
  const studentWalletAddress = await client.walletAddress.get({
    url: studentWalletAddressUrl
  })

  console.log('✓ Step 1: Got wallet addresses')

  // NO LONGER NEED TO FINALIZE - we already have the finalized token!
  // Just use it directly

  // Step 2: Get incoming payment grant for student
  const incomingPaymentGrant = await client.grant.request(
    {
      url: studentWalletAddress.authServer
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

  console.log('✓ Step 2: Got incoming payment grant for student')

  // Step 3: Create incoming payment
  const incomingPayment = await client.incomingPayment.create(
    {
      url: studentWalletAddress.resourceServer,
      accessToken: incomingPaymentGrant.access_token.value
    },
    {
      walletAddress: studentWalletAddress.id,
      incomingAmount: {
        assetCode: studentWalletAddress.assetCode,
        assetScale: studentWalletAddress.assetScale,
        value: amount.toString()
      },
      metadata: {
        description: 'Shabaha learning reward'
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

  // Step 6: Create outgoing payment using the FINALIZED access token
  const outgoingPayment = await client.outgoingPayment.create(
    {
      url: sendingWalletAddress.resourceServer,
      accessToken: finalizedAccessToken // Use the stored finalized token
    },
    {
      walletAddress: sendingWalletAddress.id,
      quoteId: quote.id,
      metadata: {
        description: 'Shabaha disbursement'
      }
    }
  )

  console.log('✓ Step 6: Created outgoing payment - funds transferred!')

  return {
    status: 'success',
    disbursementId: outgoingPayment.id,
    outgoingPaymentId: outgoingPayment.id,
    incomingPaymentId: incomingPayment.id,
    quoteId: quote.id,
    message: 'Payment completed successfully'
  }
}
// If running directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      // These values would come from WordPress database
      const config = {
        privateKeyPath: 'general-test-private.key',
        keyId: 'b4fe7d1d-76bc-4290-b280-eba1f3021b9f',
        clientWalletAddressUrl: 'https://ilp.interledger-test.dev/388aba51',
        sendingWalletAddressUrl: 'https://ilp.interledger-test.dev/388aba51',
        
        // These come from fund-wallet.js result stored in DB
        continueUri: 'PASTE_CONTINUE_URI_HERE',
        continueAccessToken: 'PASTE_CONTINUE_ACCESS_TOKEN_HERE',
        quoteId: 'PASTE_QUOTE_ID_HERE',
        incomingPaymentId: 'PASTE_INCOMING_PAYMENT_ID_HERE'
      }

      const result = await processDisbursement(config)
      console.log('\n✅ DISBURSEMENT COMPLETE:')
      console.log(JSON.stringify(result, null, 2))
      
    } catch (error) {
      console.error('❌ Error:', error.message)
      process.exit(1)
    }
  })()
}