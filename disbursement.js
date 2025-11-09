/**
 * Disbursement - Uses stored authorized grant
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
    continueUri,
    continueAccessToken,
    interact_ref  // NEW - from callback
  } = config

  const client = await createAuthenticatedClient({
    walletAddressUrl: clientWalletAddressUrl,
    keyId: keyId,
    privateKey: privateKeyPath
  })

  console.log('🎯 Starting disbursement')
  console.log('   Amount: $' + (amount / 100).toFixed(2))

  // Step 1: Get wallet addresses
  const sendingWalletAddress = await client.walletAddress.get({
    url: sendingWalletAddressUrl
  })
  
  const studentWalletAddress = await client.walletAddress.get({
    url: studentWalletAddressUrl
  })

  console.log('✓ Step 1: Got wallet addresses')

  // Step 2: Continue grant WITH interact_ref
  console.log('🔄 Continuing grant...')
  
  const finalizedGrant = await client.grant.continue({
    url: continueUri,
    accessToken: continueAccessToken,
    interact_ref: interact_ref  // CRITICAL - needed for callback-based grants
  })

  if (!isFinalizedGrant(finalizedGrant)) {
    throw new Error('Grant not finalized')
  }

  console.log('✓ Step 2: Grant finalized')

  // Step 3: Get incoming payment grant for student
  const incomingPaymentGrant = await client.grant.request(
    { url: studentWalletAddress.authServer },
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

  console.log('✓ Step 3: Got incoming payment grant')

  // Step 4: Create incoming payment
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

  console.log('✓ Step 4: Created incoming payment')

  // Step 5: Get quote grant
  const quoteGrant = await client.grant.request(
    { url: sendingWalletAddress.authServer },
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

  console.log('✓ Step 5: Got quote grant')

  // Step 6: Create quote
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

  console.log('✓ Step 6: Created quote')

  // Step 7: Create outgoing payment with finalized grant
  const outgoingPayment = await client.outgoingPayment.create(
    {
      url: sendingWalletAddress.resourceServer,
      accessToken: finalizedGrant.access_token.value
    },
    {
      walletAddress: sendingWalletAddress.id,
      quoteId: quote.id,
      metadata: {
        description: 'Shabaha disbursement'
      }
    }
  )

  console.log('✅ Step 7: Payment complete!')

  return {
    status: 'success',
    disbursementId: outgoingPayment.id,
    outgoingPaymentId: outgoingPayment.id,
    incomingPaymentId: incomingPayment.id,
    quoteId: quote.id,
    message: 'Payment completed successfully'
  }
}