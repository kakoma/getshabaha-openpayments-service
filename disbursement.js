/**
 * Disbursement Script - Run when student claims points
 * Uses stored grant info to finalize and create outgoing payment
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
    continueUri,
    continueAccessToken
  } = config

  const client = await createAuthenticatedClient({
    walletAddressUrl: clientWalletAddressUrl,
    keyId: keyId,
    privateKey: privateKeyPath
  })

  console.log('✓ Got sending wallet address')

  // Step 7: Continue the grant (finalize it)
  let finalizedOutgoingPaymentGrant

  try {
    console.log('🔄 Continuing grant...')
    console.log('   URI:', continueUri)
    
    finalizedOutgoingPaymentGrant = await client.grant.continue({
      url: continueUri,
      accessToken: continueAccessToken
    })
  } catch (err) {
    console.error('Grant continuation error:', err)
    
    if (err instanceof OpenPaymentsClientError) {
      throw new Error(
        'Grant continuation failed. The funder authorization may have expired or been already used. Please create a new funding pool.'
      )
    }
    throw err
  }

  if (!isFinalizedGrant(finalizedOutgoingPaymentGrant)) {
    throw new Error('Grant is not finalized. Funder must authorize first.')
  }

  console.log('✓ Finalized outgoing payment grant')

  // Get the wallet address and quote from the finalized grant
  const sendingWalletAddress = await client.walletAddress.get({
    url: sendingWalletAddressUrl
  })

  // The quote ID should be in the finalized grant
  const quoteId = finalizedOutgoingPaymentGrant.access_token.access[0]?.limits?.receiver || null
  
  if (!quoteId) {
    console.error('Finalized grant:', finalizedOutgoingPaymentGrant)
    throw new Error('Quote ID not found in finalized grant')
  }

  console.log('✓ Got quote ID from grant:', quoteId)

  // Step 7c: Create outgoing payment
  const outgoingPayment = await client.outgoingPayment.create(
    {
      url: sendingWalletAddress.resourceServer,
      accessToken: finalizedOutgoingPaymentGrant.access_token.value
    },
    {
      walletAddress: sendingWalletAddress.id,
      quoteId: quoteId
    }
  )

  console.log('✓ Created outgoing payment - funds transferred!')

  return {
    status: 'success',
    disbursementId: outgoingPayment.id,
    outgoingPaymentId: outgoingPayment.id,
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