/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define(function (require, exports, module) {
  'use strict';

  const Account = require('models/account');
  const Assertion = require('lib/assertion');
  const AuthErrors = require('lib/auth-errors');
  const chai = require('chai');
  const Constants = require('lib/constants');
  const OAuthAuthenticationBroker = require('models/auth_brokers/oauth');
  const OAuthClient = require('lib/oauth-client');
  const OAuthErrors = require('lib/oauth-errors');
  const Relier = require('models/reliers/relier');
  const Session = require('lib/session');
  const sinon = require('sinon');
  const User = require('models/user');

  var assert = chai.assert;

  var HEX_CHARSET = '0123456789abcdef';
  function generateOAuthCode() {
    var code = '';

    for (var i = 0; i < 64; ++i) {
      code += HEX_CHARSET.charAt(Math.floor(Math.random() * 16));
    }

    return code;
  }

  var VALID_OAUTH_CODE = generateOAuthCode();
  var VALID_OAUTH_CODE_REDIRECT_URL = 'https://127.0.0.1:8080?state=state&code=' + VALID_OAUTH_CODE;
  var INVALID_OAUTH_CODE_REDIRECT_URL = 'https://127.0.0.1:8080?code=code&state=state';

  describe('models/auth_brokers/oauth', function () {
    var account;
    var assertionLibrary;
    var broker;
    var oAuthClient;
    var relier;
    var user;

    beforeEach(function () {
      oAuthClient = new OAuthClient();
      sinon.stub(oAuthClient, 'getCode').callsFake(function () {
        return Promise.resolve({
          redirect: VALID_OAUTH_CODE_REDIRECT_URL
        });
      });

      assertionLibrary = new Assertion({});
      sinon.stub(assertionLibrary, 'generate').callsFake(function () {
        return Promise.resolve('assertion');
      });

      relier = new Relier();
      relier.set({
        action: 'action',
        clientId: 'clientId',
        scope: 'scope',
        state: 'state'
      });

      user = new User();

      account = user.initAccount({
        sessionToken: 'abc123'
      });

      broker = new OAuthAuthenticationBroker({
        assertionLibrary: assertionLibrary,
        oAuthClient: oAuthClient,
        relier: relier,
        session: Session
      });

      sinon.spy(broker, 'finishOAuthFlow');
    });

    it('has the `signup` capability by default', function () {
      assert.isTrue(broker.hasCapability('signup'));
    });

    it('does not have the `handleSignedInNotification` capability by default', function () {
      assert.isFalse(broker.hasCapability('handleSignedInNotification'));
    });

    it('has the `emailVerificationMarketingSnippet` capability by default', function () {
      assert.isTrue(broker.hasCapability('emailVerificationMarketingSnippet'));
    });

    describe('sendOAuthResultToRelier', function () {
      it('must be overridden', function () {
        return broker.sendOAuthResultToRelier()
          .then(assert.fail, function (err) {
            assert.ok(err);
          });
      });
    });

    describe('afterSignInConfirmationPoll', () => {
      it('calls sendOAuthResultToRelier with the correct options', () => {
        sinon.stub(broker, 'sendOAuthResultToRelier').callsFake(() => {
          return Promise.resolve();
        });

        return broker.afterSignInConfirmationPoll(account)
          .then((behavior) => {
            assert.isTrue(broker.finishOAuthFlow.calledWith(account, {
              action: Constants.OAUTH_ACTION_SIGNIN
            }));
            assert.isTrue(broker.sendOAuthResultToRelier.calledWith({
              action: Constants.OAUTH_ACTION_SIGNIN,
              code: VALID_OAUTH_CODE,
              redirect: VALID_OAUTH_CODE_REDIRECT_URL,
              state: 'state'
            }));
            // The Hello window will close the screen, no need to transition
            assert.isTrue(behavior.halt);
          });
      });

      it('returns any errors returned by getOAuthResult', () => {
        sinon.stub(broker, 'getOAuthResult').callsFake(() => {
          return Promise.reject(new Error('uh oh'));
        });

        return broker.afterSignInConfirmationPoll(account)
          .then(assert.fail, (err) => {
            assert.equal(err.message, 'uh oh');
          });
      });
    });

    describe('afterSignIn', function () {
      it('calls sendOAuthResultToRelier with the correct options', function () {
        sinon.stub(broker, 'sendOAuthResultToRelier').callsFake(function () {
          return Promise.resolve();
        });

        return broker.afterSignIn(account)
          .then(function () {
            assert.isTrue(broker.finishOAuthFlow.calledWith(account, {
              action: Constants.OAUTH_ACTION_SIGNIN
            }));
            assert.isTrue(broker.sendOAuthResultToRelier.calledWith({
              action: Constants.OAUTH_ACTION_SIGNIN,
              code: VALID_OAUTH_CODE,
              redirect: VALID_OAUTH_CODE_REDIRECT_URL,
              state: 'state'
            }));
          });
      });

      it('returns any errors returned by getOAuthResult', function () {
        sinon.stub(broker, 'getOAuthResult').callsFake(function () {
          return Promise.reject(new Error('uh oh'));
        });

        return broker.afterSignIn(account)
          .then(assert.fail, function (err) {
            assert.equal(err.message, 'uh oh');
          });
      });
    });

    describe('persistVerificationData', function () {
      it('saves OAuth params to session', function () {
        return broker.persistVerificationData(account)
          .then(function () {
            assert.ok(!! Session.oauth);
          });
      });
    });

    describe('afterSignUpConfirmationPoll', function () {
      it('calls sendOAuthResultToRelier with the correct options', function () {
        sinon.stub(broker, 'sendOAuthResultToRelier').callsFake(function () {
          return Promise.resolve();
        });

        return broker.afterSignUpConfirmationPoll(account)
          .then(function () {
            assert.isTrue(broker.finishOAuthFlow.calledWith(account, {
              action: Constants.OAUTH_ACTION_SIGNUP
            }));
            assert.isTrue(broker.sendOAuthResultToRelier.calledWith({
              action: Constants.OAUTH_ACTION_SIGNUP,
              code: VALID_OAUTH_CODE,
              redirect: VALID_OAUTH_CODE_REDIRECT_URL,
              state: 'state'
            }));
          });
      });
    });

    describe('afterResetPasswordConfirmationPoll', function () {
      it('calls sendOAuthResultToRelier with the expected options', function () {
        sinon.stub(broker, 'sendOAuthResultToRelier').callsFake(function () {
          return Promise.resolve();
        });

        return broker.afterResetPasswordConfirmationPoll(account)
          .then(function () {
            assert.isTrue(broker.finishOAuthFlow.calledWith(account, {
              action: Constants.OAUTH_ACTION_SIGNIN
            }));
            assert.isTrue(broker.sendOAuthResultToRelier.calledWith({
              action: Constants.OAUTH_ACTION_SIGNIN,
              code: VALID_OAUTH_CODE,
              redirect: VALID_OAUTH_CODE_REDIRECT_URL,
              state: 'state'
            }));
          });
      });
    });

    describe('getOAuthResult', function () {
      it('gets an object with the OAuth login information', function () {
        return broker.getOAuthResult(account)
          .then(function (result) {
            assert.isTrue(assertionLibrary.generate.calledWith(account.get('sessionToken'), null, 'clientId'));
            assert.equal(result.redirect, VALID_OAUTH_CODE_REDIRECT_URL);
            assert.equal(result.state, 'state');
            assert.equal(result.code, VALID_OAUTH_CODE);
          });
      });

      it('passes on errors from assertion generation', function () {
        assertionLibrary.generate.restore();
        sinon.stub(assertionLibrary, 'generate').callsFake(function () {
          return Promise.reject(new Error('uh oh'));
        });

        return broker.getOAuthResult(account)
          .then(assert.fail, function (err) {
            assert.equal(err.message, 'uh oh');
          });
      });

      it('passes on errors from oAuthClient.getCode', function () {
        oAuthClient.getCode.restore();
        sinon.stub(oAuthClient, 'getCode').callsFake(function () {
          return Promise.reject(new Error('uh oh'));
        });

        return broker.getOAuthResult(account)
          .then(assert.fail, function (err) {
            assert.equal(err.message, 'uh oh');
          });
      });

      it('throws an error if oAuthClient.getCode returns nothing', function () {
        oAuthClient.getCode.restore();
        sinon.stub(oAuthClient, 'getCode').callsFake(function () {
          return;
        });

        return broker.getOAuthResult(account)
          .then(assert.fail, function (err) {
            assert.isTrue(OAuthErrors.is(err, 'INVALID_RESULT'));
          });
      });

      it('throws an error if oAuthClient.getCode returns an empty object', function () {
        oAuthClient.getCode.restore();
        sinon.stub(oAuthClient, 'getCode').callsFake(function () {
          return {};
        });

        return broker.getOAuthResult(account)
          .then(assert.fail, function (err) {
            assert.isTrue(OAuthErrors.is(err, 'INVALID_RESULT_REDIRECT'));
          });
      });

      it('throws an error if oAuthClient.getCode returns an invalid code', function () {
        oAuthClient.getCode.restore();
        sinon.stub(oAuthClient, 'getCode').callsFake(function () {
          return {
            redirect: INVALID_OAUTH_CODE_REDIRECT_URL
          };
        });

        return broker.getOAuthResult(account)
          .then(assert.fail, function (err) {
            assert.isTrue(OAuthErrors.is(err, 'INVALID_RESULT_CODE'));
          });
      });

      it('throws an error if accountData is missing', function () {
        return broker.getOAuthResult()
          .then(assert.fail, function (err) {
            assert.isTrue(AuthErrors.is(err, 'INVALID_TOKEN'));
          });
      });

      it('throws an error if accountData is missing a sessionToken', function () {
        return broker.getOAuthResult(user.initAccount())
          .then(assert.fail, function (err) {
            assert.isTrue(AuthErrors.is(err, 'INVALID_TOKEN'));
          });
      });
    });

    describe('transformLink', function () {
      it('prepends `/oauth` to the link', function () {
        var transformed = broker.transformLink('/signin');
        assert.include(transformed, '/oauth/signin');
      });

      it('adds necessary separator', function () {
        var transformed = broker.transformLink('signin');
        assert.include(transformed, '/oauth/signin');
      });
    });

    describe('_provisionScopedKeys', () => {
      let accountKey;
      const keysJwk = 'jwk';
      const keys = {
        kA: 'foo',
        kB: 'bar'
      };
      const scope = 'https://identity.mozilla.org/apps/sample-scope-can-scope-key';
      const keyData = {
        [scope]: {
          identifier: scope,
          keyRotationSecret: '0000000000000000000000000000000000000000000000000000000000000000',
          keyRotationTimestamp: 1506970363512
        }
      };

      beforeEach(() => {
        sinon.stub(broker._oAuthClient, 'getClientKeyData').callsFake((args) => {
          assert.equal(args.assertion, 'assertion');
          assert.equal(args.client_id, 'clientId');
          assert.equal(args.scope, 'scope');

          return Promise.resolve(keyData);
        });

        accountKey = new Account({
          email: 'testuser@testuser.com',
          keyFetchToken: 'key-fetch-token',
          uid: 'uid',
          unwrapBKey: 'unwrap-b-key'
        });

        sinon.stub(accountKey, 'accountKeys').callsFake((args) => {
          return Promise.resolve(keys);
        });
      });

      it('calls _provisionScopedKeys to encrypt the bundle', () => {
        relier.set('keysJwk', keysJwk);

        sinon.stub(broker._scopedKeys, 'createEncryptedBundle').callsFake((_keys, _keyData, _jwk) => {
          assert.equal(_keys, keys);
          assert.equal(_keyData, keyData);
          assert.equal(_jwk, keysJwk);

          return Promise.resolve('bundle');
        });

        return broker._provisionScopedKeys(accountKey, 'assertion')
          .then((result) => {
            assert.isTrue(broker._scopedKeys.createEncryptedBundle.calledOnce);
            assert.equal(result, 'bundle');
          });
      });

      it('returns null if no unwrapBKey', () => {
        accountKey.set('unwrapBKey', null);

        return broker._provisionScopedKeys(accountKey, 'assertion')
          .then((result) => {
            assert.equal(result, null);
          });
      });

      it('returns null if no clientKeyData', () => {
        broker._oAuthClient.getClientKeyData.restore();
        sinon.stub(broker._oAuthClient, 'getClientKeyData').callsFake((args) => {
          return Promise.resolve({});
        });

        return broker._provisionScopedKeys(accountKey, 'assertion')
          .then((result) => {
            assert.equal(result, null);
          });
      });

    });

  });
});


