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
    mustUpgradeTemplate: Template,
    className: 'upgrade-session',
    viewName: 'settings.upgrade-session',

    events: {
      'click .refresh': preventDefaultThen('refreshVerifiedState'),
      'click .resend': preventDefaultThen('send'),
      'click .verify-send-email': preventDefaultThen('send'),
    },

    beforeRender () {
      const account = this.getSignedInAccount();
      return account.recoveryEmailSecondaryEmailEnabled()
        .then((isEnabled) => {
          if (! isEnabled) {
            this.template = this.mustUpgradeTemplate;
          } else {
            this.template = this.upgradedTemplate;
            if (this.model.get('refreshing')) {
              this.model.set({
                isPanelOpen: true,
                success: t('Primary email verified')
              });
              this.model.unset('refreshing');
            }
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
        });
    },

    setInitialContext (context) {
      context.set('email', this.getSignedInAccount().get('email'));
    },

    refreshVerifiedState () {
      this.model.set('refreshing', true);

      return this.render();
    }
  });

  Cocktail.mixin(
    View,
    SettingsPanelMixin
  );

  module.exports = View;
});
