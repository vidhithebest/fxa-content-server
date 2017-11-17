/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define(function (require, exports, module) {
  'use strict';

  const _ = require('underscore');
  const { assert } = require('chai');
  const Constants = require('lib/constants');
  const OAuthClient = require('lib/oauth-client');
  const OAuthErrors = require('lib/oauth-errors');
  const OAuthRelier = require('models/reliers/oauth');
  const Session = require('lib/session');
  const sinon = require('sinon');
  const TestHelpers = require('../../../lib/helpers');
  const User = require('models/user');
  const WindowMock = require('../../../mocks/window');

  /*eslint-disable camelcase */
  var getValueLabel = TestHelpers.getValueLabel;

  describe('models/reliers/oauth', function () {
    var err;
    var isTrusted;
    var oAuthClient;
    var relier;
    var user;
    var windowMock;

    var ACCESS_TYPE = 'offline';
    var ACTION = 'signup';
    var CLIENT_ID = 'dcdb5ae7add825d2';
    var CLIENT_IMAGE_URI = 'https://mozorg.cdn.mozilla.net/media/img/firefox/new/header-firefox.pngx';
    var PROMPT = Constants.OAUTH_PROMPT_CONSENT;
    var REDIRECT_URI = 'http://redirect.here';
    var SCOPE = 'profile:email profile:uid';
    var SCOPE_PROFILE = Constants.OAUTH_TRUSTED_PROFILE_SCOPE;
    var SCOPE_PROFILE_EXPANDED = Constants.OAUTH_TRUSTED_PROFILE_SCOPE_EXPANSION.join(' ');
    var PERMISSIONS = ['profile:email', 'profile:uid'];
    var SCOPE_WITH_EXTRAS = 'profile:email profile:uid profile:non_whitelisted';
    var SERVER_REDIRECT_URI = 'http://127.0.0.1:8080/api/oauth';
    var SERVICE = 'service';
    var SERVICE_NAME = '123Done';
    var STATE = 'fakestatetoken';
    var CODE_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    var CODE_CHALLENGE_METHOD = 'S256';

    var RESUME_INFO = {
      access_type: ACCESS_TYPE,
      action: ACTION,
      client_id: CLIENT_ID,
      scope: SCOPE,
      state: STATE
    };

    beforeEach(function () {
      isTrusted = false;
      oAuthClient = new OAuthClient();
      windowMock = new WindowMock();

      mockGetClientInfo();

      user = new User();

      relier = new OAuthRelier({}, {
        config: {},
        oAuthClient: oAuthClient,
        session: Session,
        window: windowMock
      });
    });

    describe('fetch', function () {
      describe('signin/signup flow', () => {
        it('populates expected fields from the search parameters', function () {
          windowMock.location.search = TestHelpers.toSearchString({
            access_type: ACCESS_TYPE,
            action: ACTION,
            client_id: CLIENT_ID,
            code_challenge: CODE_CHALLENGE,
            code_challenge_method: CODE_CHALLENGE_METHOD,
            prompt: PROMPT,
            redirect_uri: REDIRECT_URI,
            scope: SCOPE,
            state: STATE
          });

          return relier.fetch()
            .then(function () {
              // context is not imported from query params
              assert.equal(relier.get('context'), Constants.OAUTH_CONTEXT);

              assert.equal(relier.get('prompt'), PROMPT);

              // service will be the client_id in the signin/up flow
              assert.equal(relier.get('service'), CLIENT_ID);
              assert.equal(relier.get('state'), STATE);

              // client_id and redirect_uri are converted to camelCase
              // for consistency with other variables in the app.
              assert.equal(relier.get('clientId'), CLIENT_ID);
              assert.equal(relier.get('accessType'), ACCESS_TYPE);

              // The redirect_uri passed in is ignored, we only care about
              // the redirect_uri returned by the oauth server
              assert.notEqual(relier.get('redirectUri'), REDIRECT_URI);
              assert.equal(relier.get('redirectUri'), SERVER_REDIRECT_URI);

              // PKCE parameters
              assert.equal(relier.get('codeChallenge'), CODE_CHALLENGE);
              assert.equal(relier.get('codeChallengeMethod'), CODE_CHALLENGE_METHOD);
            });
        });

        it('throws if `service` is specified', () => {
          windowMock.location.search = TestHelpers.toSearchString({
            access_type: ACCESS_TYPE,
            action: ACTION,
            client_id: CLIENT_ID,
            prompt: PROMPT,
            redirect_uri: REDIRECT_URI,
            scope: SCOPE,
            service: SERVICE,
            state: STATE
          });

          return relier.fetch()
            .then(assert.fail, (err) => {
              assert.isTrue(OAuthErrors.is(err, 'INVALID_PARAMETER'));
            });
        });

        it('throws if invalid PKCE code_challenge is specified', () => {
          windowMock.location.search = TestHelpers.toSearchString({
            access_type: ACCESS_TYPE,
            action: ACTION,
            client_id: CLIENT_ID,
            code_challenge: 'foo',
            prompt: PROMPT,
            redirect_uri: REDIRECT_URI,
            scope: SCOPE,
            state: STATE
          });

          return relier.fetch()
            .then(assert.fail, (err) => {
              assert.isTrue(OAuthErrors.is(err, 'INVALID_PARAMETER'));
              assert.equal(err.param, 'code_challenge');
            });
        });

        it('throws if invalid PKCE code_challenge_method is specified', () => {
          windowMock.location.search = TestHelpers.toSearchString({
            access_type: ACCESS_TYPE,
            action: ACTION,
            client_id: CLIENT_ID,
            code_challenge_method: 'foo',
            prompt: PROMPT,
            redirect_uri: REDIRECT_URI,
            scope: SCOPE,
            state: STATE
          });

          return relier.fetch()
            .then(assert.fail, (err) => {
              assert.isTrue(OAuthErrors.is(err, 'INVALID_PARAMETER'));
              assert.equal(err.param, 'code_challenge_method');
            });
        });
      });

      describe('verification flow', () => {
        it('populates OAuth information from Session if verifying in the same browser', function () {
          windowMock.location.search = TestHelpers.toSearchString({
            code: '123'
          });
          Session.set('oauth', RESUME_INFO);

          return relier.fetch()
            .then(function () {
              assert.equal(relier.get('state'), STATE);
              // both clientId and service are populated from the stored info.
              assert.equal(relier.get('clientId'), CLIENT_ID);
              assert.equal(relier.get('service'), CLIENT_ID);
              assert.equal(relier.get('scope'), SCOPE);
              assert.equal(relier.get('accessType'), ACCESS_TYPE);
            });
        });

        it('populates OAuth information from from the `service` query params if verifying in a second browser', function () {
          windowMock.location.search = TestHelpers.toSearchString({
            code: '123',
            scope: SCOPE,
            service: CLIENT_ID
          });

          return relier.fetch()
            .then(function () {
              assert.equal(relier.get('clientId'), CLIENT_ID);
              assert.equal(relier.get('service'), CLIENT_ID);
            });
        });
      });

      it('sets serviceName, and redirectUri from parameters returned by the server', function () {
        windowMock.location.search = TestHelpers.toSearchString({
          action: ACTION,
          client_id: CLIENT_ID,
          redirect_uri: REDIRECT_URI,
          scope: SCOPE,
          state: STATE
        });

        return relier.fetch()
          .then(function () {
            assert.equal(relier.get('serviceName'), SERVICE_NAME);
            assert.equal(relier.get('redirectUri'), SERVER_REDIRECT_URI);
          });
      });

      describe('query parameter validation', function () {
        describe('access_type', function () {
          var validValues = [undefined, 'offline', 'online'];
          testValidQueryParams('access_type', validValues, 'accessType', validValues);

          var invalidValues = ['', ' ', 'invalid'];
          testInvalidQueryParams('access_type', invalidValues);
        });

        describe('client_id', function () {
          testMissingRequiredQueryParam('client_id');

          var invalidValues = ['', ' ', 'not-hex'];
          testInvalidQueryParams('client_id', invalidValues);

          describe('is unknown', function () {
            beforeEach(function () {
              oAuthClient.getClientInfo.restore();
              sinon.stub(oAuthClient, 'getClientInfo').callsFake(function () {
                var err = OAuthErrors.toError('INVALID_PARAMETER');
                err.validation = {
                  keys: ['client_id']
                };
                return Promise.reject(err);
              });

              return fetchExpectError({
                client_id: '1234567abcde', // Invalid client
                scope: SCOPE
              });
            });

            it('errors correctly', function () {
              // INVALID_PARAMETER should be converted to UNKNOWN_CLIENT
              assert.isTrue(OAuthErrors.is(err, 'UNKNOWN_CLIENT'));
            });
          });

          describe('is missing in verification flow', function () {
            beforeEach(function () {
              Session.set('oauth', {
                action: ACTION,
                scope: SCOPE,
                state: STATE
              });

              return fetchExpectError({
                code: '123'
              });
            });

            it('errors correctly', function () {
              assert.isTrue(OAuthErrors.is(err, 'MISSING_PARAMETER'));
              assert.equal(err.param, 'client_id');
            });
          });

          describe('is valid', function () {
            beforeEach(function () {
              return fetchExpectSuccess({
                client_id: CLIENT_ID,
                scope: SCOPE
              });
            });

            it('populates service with client_id', function () {
              assert.equal(relier.get('service'), CLIENT_ID);
            });
          });
        });

        describe('prompt', function () {
          var invalidValues = ['', ' ', 'invalid'];
          testInvalidQueryParams('prompt', invalidValues);

          var validValues = [undefined, Constants.OAUTH_PROMPT_CONSENT];
          testValidQueryParams('prompt', validValues, 'prompt', validValues);
        });

        describe('redirectTo', function () {
          var invalidValues = ['', ' '];
          testInvalidQueryParams('redirectTo', invalidValues);

          var validValues = [undefined, 'http://testdomain.com'];
          testValidQueryParams('redirectTo', validValues, 'redirectTo', validValues);
        });

        describe('redirect_uri', function () {
          var validQueryParamValues = [undefined, REDIRECT_URI];
          // redirectUri will always be loaded from the server
          var expectedValues = [SERVER_REDIRECT_URI, SERVER_REDIRECT_URI];
          testValidQueryParams('redirect_uri', validQueryParamValues, 'redirectUri', expectedValues);

          var invalidQueryParamValues = ['', ' ', 'not-a-url'];
          testInvalidQueryParams('redirect_uri', invalidQueryParamValues);
        });

        describe('scope', function () {
          testMissingRequiredQueryParam('scope');

          var invalidValues = ['', ' '];
          testInvalidQueryParams('scope', invalidValues);

          describe('is valid', function () {
            testValidQueryParam('scope', SCOPE, 'scope', SCOPE);

            it('transforms to permissions', function () {
              assert.deepEqual(relier.get('permissions'), PERMISSIONS);
            });
          });

          describe('untrusted reliers', function () {
            beforeEach(function () {
              sinon.stub(relier, 'isTrusted').callsFake(function () {
                return false;
              });
            });

            var validValues = [SCOPE_WITH_EXTRAS];
            var expectedValues = [SCOPE];
            testValidQueryParams('scope', validValues, 'scope', expectedValues);

            var invalidValues = ['profile', 'profile:unrecognized'];
            testInvalidQueryParams('scope', invalidValues);
          });

          describe('trusted reliers that dont ask for consent', function () {
            beforeEach(function () {
              sinon.stub(relier, 'isTrusted').callsFake(function () {
                return true;
              });
              sinon.stub(relier, 'wantsConsent').callsFake(function () {
                return false;
              });
            });

            var validValues = [SCOPE_WITH_EXTRAS, SCOPE_PROFILE, 'profile:unrecognized'];
            var expectedValues = [SCOPE_WITH_EXTRAS, SCOPE_PROFILE, 'profile:unrecognized'];
            testValidQueryParams('scope', validValues, 'scope', expectedValues);
          });

          describe('trusted reliers that ask for consent', function () {
            beforeEach(function () {
              sinon.stub(relier, 'isTrusted').callsFake(function () {
                return true;
              });
              sinon.stub(relier, 'wantsConsent').callsFake(function () {
                return true;
              });
            });

            var validValues = [SCOPE_WITH_EXTRAS, SCOPE_PROFILE, 'profile:unrecognized'];
            var expectedValues = [SCOPE_WITH_EXTRAS, SCOPE_PROFILE_EXPANDED, 'profile:unrecognized'];
            testValidQueryParams('scope', validValues, 'scope', expectedValues);
          });
        });
      });

      describe('client info validation', function () {

        describe('image_uri', function () {
          // leading & trailing whitespace will be trimmed
          var validValues = ['', ' ', CLIENT_IMAGE_URI, ' ' + CLIENT_IMAGE_URI];
          var expectedValues = ['', '', CLIENT_IMAGE_URI, CLIENT_IMAGE_URI];
          testValidClientInfoValues(
            'image_uri', validValues, 'imageUri', expectedValues);

          var invalidValues = ['not-a-url'];
          testInvalidClientInfoValues('image_uri', invalidValues);
        });

        describe('name', function () {
          var validValues = ['client name'];
          testValidClientInfoValues('name', validValues, 'serviceName', validValues);

          var invalidValues = ['', ' '];
          testInvalidClientInfoValues('name', invalidValues);
        });

        describe('redirect_uri', function () {
          describe('is missing on the server', function () {
            testMissingClientInfoValue('redirect_uri');
          });

          var invalidClientInfoValues = ['', ' '];
          testInvalidClientInfoValues('redirect_uri', invalidClientInfoValues);
        });

        describe('trusted', function () {
          var validValues = ['true', true, 'false', false];
          var expected = [true, true, false, false];
          testValidClientInfoValues('trusted', validValues, 'trusted', expected);
          var invalidValues = ['', 'not-a-boolean'];
          testInvalidClientInfoValues('trusted', invalidValues);
        });
      });
    });

    describe('isTrusted', function () {
      beforeEach(function () {
        windowMock.location.search = TestHelpers.toSearchString({
          client_id: CLIENT_ID,
          scope: SCOPE
        });
      });

      describe('when `trusted` is true', function () {
        beforeEach(function () {
          isTrusted = true;
          return relier.fetch();
        });

        it('returns `true`', function () {
          assert.isTrue(relier.isTrusted());
        });
      });

      describe('when `trusted` is false', function () {
        beforeEach(function () {
          isTrusted = false;
          return relier.fetch();
        });

        it('returns `false`', function () {
          assert.isFalse(relier.isTrusted());
        });
      });
    });

    describe('isOAuth', function () {
      it('returns `true`', function () {
        assert.isTrue(relier.isOAuth());
      });
    });

    describe('pickResumeTokenInfo', function () {
      it('returns an object with info to be passed along with email verification links', function () {
        var UTM_CAMPAIGN = 'campaign id';
        var ITEM = 'item';
        var ENTRYPOINT = 'entry point';
        var STATE = 'some long opaque state token';

        relier.set({
          entrypoint: ENTRYPOINT,
          notPassed: 'this should not be picked',
          resetPasswordConfirm: false,
          state: STATE,
          utmCampaign: UTM_CAMPAIGN,
          utmContent: ITEM,
          utmMedium: ITEM,
          utmSource: ITEM,
          utmTerm: ITEM
        });

        assert.deepEqual(relier.pickResumeTokenInfo(), {
          // ensure campaign and entrypoint from
          // the Relier are still passed.
          entrypoint: ENTRYPOINT,
          resetPasswordConfirm: false,
          utmCampaign: UTM_CAMPAIGN,
          utmContent: ITEM,
          utmMedium: ITEM,
          utmSource: ITEM,
          utmTerm: ITEM
        });
      });
    });

    describe('_validateKeyScopeRequest', () => {
      const scopeApp1 = 'profile openid https://identity.mozilla.org/apps/lockbox';
      const scopeApp1Redirect = 'https://dee85c67bd72f3de1f0a0fb62a8fe9b9b1a166d7.extensions.allizom.org';
      const scopeApp1Redirect2 = 'lockbox://redirect.ios';
      const scopeApp2Redirect = 'https://2aa95473a5115d5f3deb36bb6875cf76f05e4c4d.extensions.allizom.org';
      const scopeNormal = 'profile';

      beforeEach(() => {
        relier._config.scopedKeysValidation = {
          'https://identity.mozilla.org/apps/lockbox': {
            redirectUris: [
              scopeApp1Redirect,
              scopeApp1Redirect2
            ]
          },
          'https://identity.mozilla.org/apps/notes': {
            redirectUris: [
              scopeApp2Redirect
            ]
          }
        };
      });

      it('returns false by default', () => {
        relier.set('scope', scopeNormal);
        assert.isFalse(relier._validateKeyScopeRequest());
      });

      it('returns true if scopes match at least one redirect uri', () => {
        relier.set('keysJwk', 'jwk');
        relier.set('scope', scopeApp1);
        relier.set('redirectUri', scopeApp1Redirect);
        assert.isTrue(relier._validateKeyScopeRequest());

        relier.set('scope', scopeApp1);
        relier.set('redirectUri', scopeApp1Redirect2);
        assert.isTrue(relier._validateKeyScopeRequest());
      });

      it('throws if a client requests keys for an unknown scoped key scope', (done) => {
        relier.set('keysJwk', 'jwk');
        relier.set('scope', 'https://identity.mozilla.org/not-found');
        relier.set('redirectUri', scopeApp2Redirect);

        try {
          relier._validateKeyScopeRequest();
        } catch (err) {
          assert.equal(err.message, 'No key-bearing scopes requested');
          done();
        }
      });

      it('throws if a client requests a scope that does not belong to it', (done) => {
        relier.set('keysJwk', 'jwk');
        relier.set('scope', scopeApp1);
        relier.set('redirectUri', scopeApp2Redirect);

        try {
          relier._validateKeyScopeRequest();
        } catch (err) {
          assert.equal(err.message, 'Invalid redirect parameter');
          done();
        }
      });
    });

    describe('wantsKeys', () => {
      it('returns false by default', () => {
        assert.isFalse(relier.wantsKeys());
      });

      it('returns false with just keysJwk', () => {
        relier._config.scopedKeysEnabled = false;
        relier.set('keysJwk', 'jwk');
        assert.isFalse(relier.wantsKeys());
      });

      it('returns false with just scopedKeysEnabled', () => {
        relier._config.scopedKeysEnabled = true;
        assert.isFalse(relier.wantsKeys());
      });

      it('throws if no scopes', () => {
        relier._config.scopedKeysEnabled = true;
        relier.set('keysJwk', 'jwk');
        assert.throws(relier.wantsKeys.bind(relier), Error, 'Invalid scope parameter');
      });

      it('returns true with keysJwk, enabled scoped keys and valid scope', () => {
        relier._config.scopedKeysEnabled = true;
        relier._config.scopedKeysValidation = {
          'https://identity.mozilla.org/apps/lockbox': {
            redirectUris: [
              'lockbox://redirect.ios'
            ]
          }
        };
        relier.set('keysJwk', 'jwk');
        relier.set('scope', 'profile https://identity.mozilla.org/apps/lockbox');
        relier.set('redirectUri', 'lockbox://redirect.ios');
        assert.isTrue(relier.wantsKeys());
      });
    });

    describe('wantsConsent', function () {
      describe('prompt=consent', function () {
        beforeEach(function () {
          relier.set('prompt', 'consent');
        });

        it('returns true', function () {
          assert.isTrue(relier.wantsConsent());
        });
      });

      describe('otherwise', function () {
        beforeEach(function () {
          relier.unset('prompt');
        });

        it('returns false', function () {
          assert.isFalse(relier.wantsConsent());
        });
      });
    });

    describe('accountNeedsPermissions', function () {
      var account;
      var hasSeenPermissions;

      beforeEach(function () {
        account = user.initAccount();
        account.set('email', 'testuser@testuser.com');

        hasSeenPermissions = false;

        sinon.stub(account, 'hasSeenPermissions').callsFake(function () {
          return hasSeenPermissions;
        });

        relier.set({
          clientId: CLIENT_ID,
          permissions: ['profile:email', 'profile:display_name']
        });
      });

      describe('a trusted relier', function () {
        beforeEach(function () {
          relier.set('trusted', true);
        });

        describe('without prompt=consent', function () {
          beforeEach(function () {
            relier.unset('prompt');
          });

          it('returns false', function () {
            assert.isFalse(relier.accountNeedsPermissions(account));
          });
        });

        describe('with prompt=consent', function () {
          beforeEach(function () {
            relier.set('prompt', 'consent');
          });

          describe('account does not need additional permissions', function () {
            beforeEach(function () {
              hasSeenPermissions = true;
            });

            it('returns false', function () {
              assert.isFalse(relier.accountNeedsPermissions(account));
            });
          });

          describe('account needs additional permissions', function () {
            beforeEach(function () {
              hasSeenPermissions = false;
            });

            it('returns true', function () {
              assert.isTrue(relier.accountNeedsPermissions(account));
            });
          });
        });
      });

      describe('an untrusted relier', function () {
        beforeEach(function () {
          relier.set('trusted', false);
        });

        describe('account has seen all the permissions', function () {
          beforeEach(function () {
            hasSeenPermissions = true;
          });

          it('should return false', function () {
            assert.isFalse(relier.accountNeedsPermissions(account));
          });

          it('should filter any permissions for which the account has no value', function () {
            relier.accountNeedsPermissions(account);
            assert.isTrue(account.hasSeenPermissions.calledWith(CLIENT_ID, ['profile:email']));
          });
        });

        describe('account has not seen all permissions', function () {
          beforeEach(function () {
            hasSeenPermissions = false;
          });

          it('should return true', function () {
            assert.isTrue(relier.accountNeedsPermissions(account));
          });

          it('should filter any permissions for which the account has no value', function () {
            relier.accountNeedsPermissions(account);
            assert.isTrue(account.hasSeenPermissions.calledWith(CLIENT_ID, ['profile:email']));
          });
        });
      });
    });

    function mockGetClientInfo(paramName, paramValue) {
      if (oAuthClient.getClientInfo.restore) {
        oAuthClient.getClientInfo.restore();
      }

      sinon.stub(oAuthClient, 'getClientInfo').callsFake(function () {
        var clientInfo = {
          id: CLIENT_ID,
          name: SERVICE_NAME,
          redirect_uri: SERVER_REDIRECT_URI,
          trusted: isTrusted
        };

        if (! _.isUndefined(paramName)) {
          if (_.isUndefined(paramValue)) {
            delete clientInfo[paramName];
          } else {
            clientInfo[paramName] = paramValue;
          }
        }

        return Promise.resolve(clientInfo);
      });
    }

    function fetchExpectError(params) {
      windowMock.location.search = TestHelpers.toSearchString(params);

      return relier.fetch()
        .then(assert.fail, function (_err) {
          err = _err;
        });
    }

    function fetchExpectSuccess(params) {
      windowMock.location.search = TestHelpers.toSearchString(params);

      return relier.fetch();
    }

    function testInvalidQueryParams(paramName, values) {
      describe('invalid', function () {
        values.forEach(function (value) {
          var description = 'is ' + getValueLabel(value);
          describe(description, function () {
            testInvalidQueryParam(paramName, value);
          });
        });
      });
    }

    function testInvalidQueryParam(paramName, value) {
      beforeEach(function () {
        var params = {
          client_id: CLIENT_ID,
          scope: SCOPE
        };

        if (! _.isUndefined(value)) {
          params[paramName] = value;
        } else {
          delete params[paramName];
        }

        return fetchExpectError(params);
      });

      it('errors correctly', function () {
        assert.isTrue(OAuthErrors.is(err, 'INVALID_PARAMETER'));
        assert.equal(err.param, paramName);
      });
    }

    function testMissingRequiredQueryParam(paramName) {
      describe('is missing', function () {
        beforeEach(function () {
          var params = {
            client_id: CLIENT_ID,
            scope: SCOPE
          };

          delete params[paramName];

          return fetchExpectError(params);
        });

        it('errors correctly', function () {
          assert.isTrue(OAuthErrors.is(err, 'MISSING_PARAMETER'));
          assert.equal(err.param, paramName);
        });
      });
    }

    function testValidQueryParams(paramName, values, modelName, expectedValues) {
      describe('valid', function () {
        values.forEach(function (value, index) {
          var description = 'is ' + getValueLabel(value);
          describe(description, function () {
            var expectedValue = expectedValues[index];
            testValidQueryParam(paramName, value, modelName, expectedValue);
          });
        });
      });
    }

    function testValidQueryParam(paramName, paramValue, modelName, expectedValue) {
      beforeEach(function () {
        var params = {
          client_id: CLIENT_ID,
          scope: SCOPE
        };

        if (! _.isUndefined(paramValue)) {
          params[paramName] = paramValue;
        } else {
          delete params[paramName];
        }

        return fetchExpectSuccess(params);
      });

      it('is successful', function () {
        if (_.isUndefined(expectedValue)) {
          assert.isFalse(relier.has(modelName));
        } else {
          assert.equal(relier.get(modelName), expectedValue);
        }
      });
    }

    function testMissingClientInfoValue(paramName) {
      beforeEach(function () {
        mockGetClientInfo(paramName, undefined);

        return fetchExpectError({
          client_id: CLIENT_ID,
          scope: SCOPE
        });
      });

      it('errors correctly', function () {
        assert.isTrue(OAuthErrors.is(err, 'MISSING_PARAMETER'));
        assert.equal(err.param, paramName);
      });
    }

    function testInvalidClientInfoValues(paramName, values) {
      values.forEach(function (value) {
        var description = 'is ' + getValueLabel(value);
        describe(description, function () {
          testInvalidClientInfoValue(paramName, value);
        });
      });
    }

    function testInvalidClientInfoValue(paramName, paramValue) {
      beforeEach(function () {
        mockGetClientInfo(paramName, paramValue);

        return fetchExpectError({
          client_id: CLIENT_ID,
          scope: SCOPE
        });
      });

      it('errors correctly', function () {
        assert.isTrue(OAuthErrors.is(err, 'INVALID_PARAMETER'));
        assert.equal(err.param, paramName);
      });
    }

    function testValidClientInfo(paramName, paramValue, modelName, expectedValue) {
      beforeEach(function () {
        mockGetClientInfo(paramName, paramValue);

        return fetchExpectSuccess({
          client_id: CLIENT_ID,
          scope: SCOPE
        });
      });

      it('is successful', function () {
        if (_.isUndefined(expectedValue)) {
          assert.isFalse(relier.has(modelName));
        } else {
          assert.equal(relier.get(modelName), expectedValue);
        }
      });
    }

    function testValidClientInfoValues(paramName, values, modelName, expectedValues) {
      values.forEach(function (value, index) {
        var description = 'is ' + getValueLabel(value);
        describe(description, function () {
          var expectedValue = expectedValues[index];
          testValidClientInfo(paramName, value, modelName, expectedValue);
        });
      });
    }
  });
});
