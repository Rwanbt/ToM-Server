/* istanbul ignore file */

// TO BE MODIFIED LATER ON --- FILE NOT IN USE FOR THE MOMENT

/**
 * Change long-term key
 */

import { generateKeyPair } from '../../crypto/index'
import { type TwakeLogger } from '../../logger/index'
import type IdentityServerDb from '../db'

const updateKey = async (
  db: IdentityServerDb,
  logger: TwakeLogger
): Promise<void> => {
  try {
    // Step 1:
    //  - Drop old-old key
    //  - Get current key
    const previousKeyRows = await db.get('longTermKeypairs', ['keyID'], {
      name: 'previousKey'
    })

    const previousKey = previousKeyRows?.[0]
    if (!previousKey) {
      /* istanbul ignore next */
      throw new Error('No previousKey found')
    }

    // Check if keyID is in the correct format /^ed25519:[A-Za-z0-9_-]+$/
    if (typeof previousKey.keyID !== 'string' || !/^ed25519:[A-Za-z0-9_-]+$/.test(previousKey.keyID)) {
      /* istanbul ignore next */
      throw new Error('previousKey value is not valid')
    }

    const currentKeyRows = await db.get(
      'longTermKeypairs',
      ['keyID', 'public', 'private'],
      { name: 'currentKey' }
    )

    const currentKey = currentKeyRows?.[0]
    if (!currentKey || typeof currentKey.keyID !== 'string' ||
        typeof currentKey.public !== 'string' || typeof currentKey.private !== 'string') {
      /* istanbul ignore next */
      throw new Error('currentKey undefined')
    }

    // Step 2:
    //  - Generate new key pair
    //  - Set previousKey to current value
    //  - Update database with new key pair
    const newKey = generateKeyPair('ed25519')

    try {
      await db.update(
        'longTermKeypairs',
        {
          keyID: currentKey.keyID,
          public: currentKey.public,
          private: currentKey.private
        },
        'name',
        'previousKey'
      )
      logger.info('Previous key updated successfully')
    } catch (error) {
      /* istanbul ignore next */
      // Database exceptions can include private signing material or connection secrets.
      logger.error('Error updating previous key')
      /* istanbul ignore next */
      throw error
    }

    try {
      await db.update(
        'longTermKeypairs',
        {
          keyID: newKey.keyId,
          public: newKey.publicKey,
          private: newKey.privateKey
        },
        'name',
        'currentKey'
      )
      logger.info('Current key updated successfully')
    } catch (error) {
      /* istanbul ignore next */
      logger.error('Error updating current key')
      /* istanbul ignore next */
      throw error
    }

    logger.info('Long-term key updated successfully')
  } catch {
    /* istanbul ignore next */
    logger.error('Error updating long-term key')
  }
}

export default updateKey
