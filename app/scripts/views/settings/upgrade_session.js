/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define(function (require, exports, module) {
  'use strict';

  const Cocktail = require('cocktail');
  const FormView = require('../form');
  const preventDefaultThen = require('../base').preventDefaultThen;
  const SettingsPanelMixin = require('../mixins/settings-panel-mixin');
  const Template = require('stache!templates/settings/upgrade_session');

  const t = (msg) => msg;

  const View = FormView.extend({
    template: Template,
    className: 'upgrade-session',
    viewName: 'settings.upgrade-session',

    events: {
      'click .resend': preventDefaultThen('send'),
      'click .verify-send-email': preventDefaultThen('send'),
    },

    beforeRender () {
      const account = this.getSignedInAccount();
      return account.recoveryEmailSecondaryEmailEnabled()
        .then((isEnabled) => {
          if (isEnabled) {
            return this.remove();
          }
        });
    },

    send () {
      const account = this.getSignedInAccount();
      return account.retrySignUp(this.relier)
        .then(() => {
          this.displaySuccess(t('Verification email sent'), {
            closePanel: false
          });
          this.navigate('settings/upgrade_session');
        });
    },

    setInitialContext (context) {
      context.set('title', 'Secondary email');
      context.set('caption', 'A secondary email is an additional address for receiving security notices and confirming new Sync devices');
      context.set('email', this.getSignedInAccount().get('email'));
    },

    submit () {
      const account = this.getSignedInAccount();
      return account.recoveryEmailSecondaryEmailEnabled()
        .then((isEnabled) => {
          if (isEnabled) {
            this.displaySuccess(t('Primary email verified'), {
              closePanel: false
            });
            this.parentView.render();
          } else {
            this.navigate('/settings/upgrade_session');
          }
        });
    }
  });

  Cocktail.mixin(
    View,
    SettingsPanelMixin
  );

  module.exports = View;
});
