/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Allow the user to unblock their signin by entering
 * in a verification code that is sent in an email.
 */
define(function (require, exports, module) {
  'use strict';

  const Cocktail = require('cocktail');
  const Constants = require('../lib/constants');
  const FormView = require('./form');
  const ResendMixin = require('./mixins/resend-mixin')();
  const SignInMixin = require('./mixins/signin-mixin');
  const Template = require('stache!templates/sign_in_code');
  const VerificationReasonMixin = require('./mixins/verification-reason-mixin');

  const proto = FormView.prototype;
  const View = FormView.extend({
    template: Template,
    className: 'sign-in-code',

    initialize (options = {}) {
      // Account data is passed in from sign up and sign in flows.
      // It's important for Sync flows where account data holds
      // ephemeral properties like unwrapBKey and keyFetchToken
      // that need to be sent to the browser.
      this._account = this.user.initAccount(this.model.get('account'));
    },

    getAccount () {
      return this._account;
    },

    beforeRender () {
      // user cannot confirm if they have not initiated a sign in.
      if (! this.getAccount().get('sessionToken')) {
        this.navigate(this._getMissingSessionTokenScreen());
      }
    },

    afterVisible () {
      const account = this.getAccount();
      return proto.afterVisible.call(this)
        .then(() => this.broker.persistVerificationData(account))
        .then(() =>
          this.invokeBrokerMethod('beforeSignUpConfirmationPoll', account)
        );
    },

    _getMissingSessionTokenScreen () {
      var screenUrl = this.isSignUp() ? 'signup' : 'signin';
      return this.broker.transformLink(screenUrl);
    },

    setInitialContext (context) {
      const email = this.getAccount().get('email');
      const supportLink = this._getSupportLink();

      context.set({
        email,
        escapedSupportLink: encodeURI(supportLink),
        hasSupportLink: !! supportLink
      });
    },

    submit () {
      const account = this.getAccount();
      const signInCode = this.getElementValue('#signin_code');
      return account.verifySignInCode(signInCode)
        .then(() => {
          return this.invokeBrokerMethod('afterCompleteSignInCode', account);
        })
        .fail((err) => this.displayError(err));
    },

    resend () {
      return this._sendSigninCodeEmail();
    },

    /**
     * Get the SUMO link for `Why is this happening to me?`. Could be
     * `undefined` if no link is available.
     *
     * @returns {String}
     */
    _getSupportLink () {
      return Constants.BLOCKED_SIGNIN_SUPPORT_URL;
    }
  });

  Cocktail.mixin(
    View,
    ResendMixin,
    SignInMixin,
    VerificationReasonMixin
  );

  module.exports = View;
});
