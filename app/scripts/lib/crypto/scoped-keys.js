/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Derive scope-specific keys from account master keys.
 */

define(function (require, exports, module) {
  'use strict';

  const requireOnDemand = require('lib/require-on-demand');

  /**
   * Given an inputKey, generate the matching relier-specific derived scoped key.
   *
   * @param {Object} inputKey - Key used to derive from
   * @param {Object} keyData - OAuth client data that is required to derive keys
   * @returns {Promise} A promise that will resolve with an object having a scoped key
   *   The key is represented as a JWK object.
   */
  function _deriveScopedKeys(inputKey, keyData) {
    return requireOnDemand('fxaCryptoDeriver').then((fxaCryptoDeriver) => {
      if (! inputKey) {
        throw new Error('Missing input key');
      }

      if (! keyData) {
        throw new Error('Missing key data');
      }

      const scopedKeys = new fxaCryptoDeriver.ScopedKeys();

      return scopedKeys.deriveScopedKey({
        identifier: keyData.identifier,
        inputKey: inputKey,
        keyRotationSecret: keyData.keyRotationSecret,
        keyRotationTimestamp: keyData.keyRotationTimestamp
      });
    });
  }

  /**
   * Derive scoped keys and create an encrypted bundle for key transport
   *
   * @param {Object} accountKeys - Account keys, used to derive scoped keys
   * @param {Object} scopedKeyData - OAuth client data that is required to derive keys
   * @param {Object} keysJwk - Public key used for scoped key encryption
   * @returns {Promise} A promise that will resolve into an encrypted bundle of scoped keys
   */
  function createEncryptedBundle(accountKeys, scopedKeyData, keysJwk) {
    const deriveKeys = Object.keys(scopedKeyData).map((key) => _deriveScopedKeys(accountKeys.kB, scopedKeyData[key]));

    return Promise.all(deriveKeys)
      .then((derivedKeys) => {
        const bundleObject = {};

        derivedKeys.forEach((derivedKey) => {
          bundleObject[derivedKey.scope] = derivedKey;
        });

        return requireOnDemand('fxaCryptoDeriver').then((fxaCryptoDeriver) => {
          const fxaDeriverUtils = new fxaCryptoDeriver.DeriverUtils();

          return fxaDeriverUtils.encryptBundle(keysJwk, JSON.stringify(bundleObject));
        });
      });
  }

  return {
    createEncryptedBundle,
    _deriveScopedKeys
  };
});
