/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define(function (require, exports, module) {
  'use strict';

  const $ = require('jquery');
  const AuthErrors = require('lib/auth-errors');
  const chai = require('chai');
  const FileReaderMock = require('../../../mocks/file-reader');
  const Metrics = require('lib/metrics');
  const Notifier = require('lib/channels/notifier');
  const p = require('lib/promise');
  const ProfileClient = require('lib/profile-client');
  const ProfileMock = require('../../../mocks/profile');
  const Relier = require('models/reliers/relier');
  const sinon = require('sinon');
  const Translator = require('lib/translator');
  const TestHelpers = require('../../../lib/helpers');
  const User = require('models/user');
  const View = require('views/settings/avatar_change');
  const WindowMock = require('../../../mocks/window');
  var wrapAssertion = TestHelpers.wrapAssertion;

  var assert = chai.assert;
  var pngSrc = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAACZJREFUeNrtwQEBAAAAgiD' +
               '/r25IQAEAAAAAAAAAAAAAAAAAAADvBkCAAAEehacTAAAAAElFTkSuQmCC';

  describe('views/settings/avatar_change', function () {
    var account;
    var metrics;
    var notifier;
    var profileClientMock;
    var relier;
    var translator;
    var user;
    var view;
    var windowMock;

    beforeEach(function () {
      notifier = new Notifier();
      metrics = new Metrics({ notifier });
      profileClientMock = new ProfileMock();
      relier = new Relier();
      translator = new Translator({forceEnglish: true});
      user = new User();
      windowMock = new WindowMock();

      view = new View({
        metrics: metrics,
        notifier: notifier,
        relier: relier,
        translator: translator,
        user: user,
        window: windowMock
      });
    });

    afterEach(function () {
      $(view.el).remove();
      view.destroy();
      view = null;
      profileClientMock = null;
    });

    describe('with session', function () {
      var accessToken = 'token';
      beforeEach(function () {
        view = new View({
          metrics: metrics,
          notifier: notifier,
          relier: relier,
          translator: translator,
          user: user,
          window: windowMock
        });

        sinon.stub(view, 'checkAuthorization').callsFake(function () {
          return p(true);
        });
        account = user.initAccount({
          accessToken: accessToken,
          email: 'a@a.com',
          verified: true
        });
        sinon.stub(account, 'getAvatar').callsFake(function () {
          return p({ avatar: pngSrc, id: 'foo' });
        });
        sinon.spy(view, 'logFlowEvent');
        sinon.stub(account, 'profileClient').callsFake(function () {
          return p(profileClientMock);
        });
        sinon.stub(view, 'getSignedInAccount').callsFake(function () {
          return account;
        });

        return view.render();
      });

      it('hides the file picker', function () {
        assert.isFalse(view.$(':file').is(':visible'));
      });

      it('can remove the avatar', function () {
        sinon.stub(view, 'deleteDisplayedAccountProfileImage').callsFake(function () {
          return p();
        });

        sinon.spy(view, 'navigate');
        return view.afterVisible()
          .then(function () {
            assert.equal(view.$('.avatar-wrapper img').length, 1);
            return view.removeAvatar();
          })
          .then(function () {
            assert.isTrue(view.deleteDisplayedAccountProfileImage.called);
            assert.isTrue(view.navigate.calledWith('settings'));
          });
      });

      it('shows error if delete fails', function () {
        sinon.stub(profileClientMock, 'deleteAvatar').callsFake(function () {
          return p.reject(ProfileClient.Errors.toError('IMAGE_PROCESSING_ERROR'));
        });

        sinon.spy(view, 'navigate');
        return view.afterVisible()
          .then(function () {
            assert.equal(view.$('.avatar-wrapper img').length, 1);
            return view.removeAvatar();
          })
          .then(function () {
            assert.fail('unexpected success');
          }, function (err) {
            assert.isTrue(ProfileClient.Errors.is(err, 'IMAGE_PROCESSING_ERROR'));
            assert.isTrue(view.isErrorVisible(), 'error is visible');
            assert.isFalse(view.navigate.calledWith('settings'));
          });
      });

      describe('with a file selected', function () {
        it('errors on an unsupported file', function () {
          return view.afterVisible()
            .then(function () {
              var ev = FileReaderMock._mockTextEvent();
              view.fileSet(ev);

              assert.equal(view.$('.error').text(), AuthErrors.toMessage('UNUSABLE_IMAGE'));
              assert.isTrue(view.isErrorVisible());
              assert.equal(view.logFlowEvent.callCount, 0);
            });
        });

        it('errors on a bad image', function () {
          view.FileReader = FileReaderMock;

          return view.afterVisible()
            .then(function () {
              var ev = FileReaderMock._mockBadPngEvent();
              return view.fileSet(ev)
                .then(function () {
                  assert.fail('unexpected success');
                }, function () {
                  assert.equal(view.$('.error').text(), AuthErrors.toMessage('UNUSABLE_IMAGE'));
                  assert.isTrue(view.isErrorVisible());
                  assert.equal(view.logFlowEvent.callCount, 0);
                });
            });
        });

        it('errors on an undersized image', function () {
          view.FileReader = FileReaderMock;

          return view.afterVisible()
            .then(function () {
              var ev = FileReaderMock._mockTinyPngEvent();
              return view.fileSet(ev)
                .then(function () {
                  assert.fail('unexpected success');
                }, function () {
                  assert.equal(view.$('.error').text(), AuthErrors.toMessage('INVALID_IMAGE_SIZE'));
                  assert.isTrue(view.isErrorVisible());

                  assert.equal(view.logFlowEvent.callCount, 1);
                  const args = view.logFlowEvent.args[0];
                  assert.lengthOf(args, 1);
                  const eventParts = args[0].split('.');
                  assert.lengthOf(eventParts, 4);
                  assert.equal(eventParts[0], 'timing');
                  assert.equal(eventParts[1], 'avatar');
                  assert.equal(eventParts[2], 'load');
                  assert.match(eventParts[3], /^[0-9]+$/);
                });
            });
        });

        it('loads a supported file', function (done) {
          view.FileReader = FileReaderMock;

          view.afterVisible()
            .then(function () {
              const ev = FileReaderMock._mockPngEvent();


              sinon.stub(view, 'navigate').callsFake(function (url, options) {
                wrapAssertion(function () {
                  assert.equal(url, 'settings/avatar/crop');
                  const cropImg = options.cropImg;
                  assert.equal(cropImg.get('src'), pngSrc);

                  assert.equal(view.logFlowEvent.callCount, 1);
                  const args = view.logFlowEvent.args[0];
                  assert.lengthOf(args, 1);
                  const eventParts = args[0].split('.');
                  assert.lengthOf(eventParts, 4);
                  assert.equal(eventParts[0], 'timing');
                  assert.equal(eventParts[1], 'avatar');
                  assert.equal(eventParts[2], 'load');
                  assert.match(eventParts[3], /^[0-9]+$/);
                }, done);
              });

              view.fileSet(ev);
            })
            .fail(done);
        });
      });

      it('properly tracks avatar change events', function (done) {
        view.FileReader = FileReaderMock;

        view.afterVisible()
          .then(function () {
            var ev = FileReaderMock._mockPngEvent();

            sinon.stub(view, 'navigate').callsFake(function () {
              wrapAssertion(function () {
                assert.isFalse(TestHelpers.isEventLogged(metrics, 'settings.avatar.change.submit.new'));
                assert.isTrue(TestHelpers.isEventLogged(metrics, 'settings.avatar.change.submit.change'));
              }, done);
            });

            view.fileSet(ev);
          })
          .fail(done);
      });

      it('properly tracks avatar new events', function (done) {
        view.FileReader = FileReaderMock;

        account.getAvatar.restore();
        sinon.stub(account, 'getAvatar').callsFake(function () {
          return p({ avatar: pngSrc, id: null });
        });

        view.afterVisible()
          .then(function () {
            var ev = FileReaderMock._mockPngEvent();

            sinon.stub(view, 'navigate').callsFake(function () {
              wrapAssertion(function () {
                assert.isTrue(TestHelpers.isEventLogged(metrics, 'settings.avatar.change.submit.new'));
                assert.isFalse(TestHelpers.isEventLogged(metrics, 'settings.avatar.change.submit.change'));
              }, done);
            });

            account.set('hadProfileImageSetBefore', false);
            view.fileSet(ev);
          })
          .fail(done);
      });

      it('clears setting param if set to avatar', function () {
        relier.set('setting', 'avatar');
        return view.render()
          .then(function () {
            assert.isUndefined(relier.get('setting'));
          });
      });
    });
  });
});
