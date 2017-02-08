/*
 * Copyright (c) 2015
 *
 * This file is licensed under the Affero General Public License version 3
 * or later.
 *
 * See the COPYING-README file.
 *
 */

(function() {
	var TEMPLATE_ITEM_INIT =
    '<li id=preserve>{{preserve}}</li>'+
    '<li id=historic>{{historic}}</li>'+
    '<li id=hideversion class=hidden></li>';

	var TEMPLATE_ITEM =
		'<li data-revision="{{timestamp}}">' +
		'<img class="preview" src="{{previewUrl}}"/>' +
		'<a href="{{downloadUrl}}" class="downloadVersion"><img src="{{downloadIconUrl}}" />' +
		'<span class="versiondate has-tooltip" title="{{formattedTimestamp}}">{{relativeTimestamp}}</span>' +
		'</a>' +
		'<a href="#" class="revertVersion" title="{{revertLabel}}"><img src="{{revertIconUrl}}" /></a>' +
    '{{#if deletable}}<a href="#" class="deleteVersion" title="{{deleteLabel}}"><img src="{{deleteIconUrl}}" /></a>{{/if}}' +
    '</li>';

	var TEMPLATE =
		'<ul class="versions"></ul>' +
		'<div class="clear-float"></div>' +
		'<div class="empty hidden">{{emptyResultLabel}}</div>' +
		'<input type="button" class="showMoreVersions hidden" value="{{moreVersionsLabel}}"' +
		' name="show-more-versions" id="show-more-versions" />' +
		'<div class="loading hidden" style="height: 50px"></div>';

	/**
	 * @memberof OCA.Versions
	 */
	var VersionsTabView = OCA.Files.DetailTabView.extend(
		/** @lends OCA.Versions.VersionsTabView.prototype */ {
		id: 'versionsTabView',
		className: 'tab versionsTabView',

		_template: null,

    versionCounter: 0,

    versionNumber: 0,

		$versionsContainer: null,

		events: {
			'click .revertVersion': '_onClickRevertVersion',
			'click .showMoreVersions': '_onClickShowMoreVersions',
			'click .deleteVersion': '_onClickDeleteVersion'
		},

		initialize: function() {
      var self = this;

      this.versionCounter = 0;
			OCA.Files.DetailTabView.prototype.initialize.apply(this, arguments);
			this.collection = new OCA.Versions.VersionCollection();
			this.collection.on('request', this._onRequest, this);
			this.collection.on('sync', this._onEndRequest, this);
			this.collection.on('update', this._onUpdate, this);
			this.collection.on('error', this._onError, this);
			this.collection.on('add', this._onAddModel, this);
    },

		getLabel: function() {
			return t('files_versions', 'Versions');
		},

		nextPage: function() {
      var self = this;
			if (this._loading || !this.collection.hasMoreResults()) {
				return;
			}

      $.ajax({
        url: OC.generateUrl('/apps/files_version_cleaner/getVersionNumber'),
        data: {uid: this.collection.getFileInfo().attributes.shareOwner}, 
        async: false,
      }).done( function(data) {
        if(data.success == true) {
          self.versionNumber = data.value;
        }
      });

			if (this.collection.getFileInfo() && this.collection.getFileInfo().isDirectory()) {
        var subtab = new OCA.VersionCleaner.VersionCleanerView({fileInfo: this.collection.getFileInfo()});
        this.$el.html(subtab.render().$el);
				return;
			}

			this.collection.fetchNext();
		},

		_onClickShowMoreVersions: function(ev) {
			ev.preventDefault();
			this.nextPage();
		},

		_onClickRevertVersion: function(ev) {
			var self = this;
			var $target = $(ev.target);
			var fileInfoModel = this.collection.getFileInfo();
			ev.preventDefault();
      OC.dialogs.confirm(
        t('files_version_cleaner', 'Are you sure to revert this version ?'),
        t('files_version_cleaner', 'Revert version'),
        function(dialogValue) {
          var revision;
          if (!$target.is('li')) {
            $target = $target.closest('li');
          }

          revision = $target.attr('data-revision');

          self.$el.find('.versions, .showMoreVersions').addClass('hidden');


          var versionModel = self.collection.get(revision);
          if(dialogValue) {
            versionModel.revert({
              success: function() {
                // reset and re-fetch the updated collection
                self.$versionsContainer.empty();
                self.collection.setFileInfo(fileInfoModel);
                self.collection.reset([], {silent: true});
                self.collection.fetchNext();

                self.$el.find('.versions').removeClass('hidden');

                // update original model
                fileInfoModel.trigger('busy', fileInfoModel, false);
                fileInfoModel.set({
                  size: versionModel.get('size'),
                  mtime: versionModel.get('timestamp') * 1000,
                  // temp dummy, until we can do a PROPFIND
                  etag: versionModel.get('id') + versionModel.get('timestamp')
                });
                self.versionCounter = 0;
              },

              error: function() {
                OC.Notification.showTemporary(
                  t('files_version', 'Failed to revert {file} to revision {timestamp}.', {
                    file: versionModel.getFullPath(),
                    timestamp: OC.Util.formatDate(versionModel.get('timestamp') * 1000)
                  })
                );
              }
            })
          }
          else{
            // reset and re-fetch the updated collection
            self.$versionsContainer.empty();
            self.collection.setFileInfo(fileInfoModel);
            self.collection.reset([], {silent: true});
            self.collection.fetchNext();

            self.$el.find('.versions').removeClass('hidden');

            // update original model
            fileInfoModel.trigger('busy', fileInfoModel, false);
            fileInfoModel.set({
              size: versionModel.get('size'),
              mtime: versionModel.get('timestamp') * 1000,
              // temp dummy, until we can do a PROPFIND
              etag: versionModel.get('id') + versionModel.get('timestamp')
            });
            self.versionCounter = 0;
          }
          // spinner
          self._toggleLoading(true);
          fileInfoModel.trigger('busy', fileInfoModel, true);
        }
      );
		},

		_onClickDeleteVersion: function(ev) {
      var self = this;
      var fileInfoModel = self.collection.getFileInfo();
      ev.preventDefault();
      OC.dialogs.confirm(
        t('files_version_cleaner', 'Are you sure to delete this version ?'),
        t('files_version_cleaner', 'Delete version'),
        function(dialogValue) {
          var $target = $(ev.target);
          var revision;
          if (!$target.is('li')) {
            $target = $target.closest('li');
          }

          revision = $target.attr('data-revision');

          self.$el.find('.versions, .showMoreVersions').addClass('hidden');

          var versionModel = self.collection.get(revision);
          if(dialogValue) {
            versionModel.deleteVersion({
              success: function() {
                // reset and re-fetch the updated collection
                self.$versionsContainer.empty();
                self.collection.setFileInfo(fileInfoModel);
                self.collection.reset([], {silent: true});
                self.collection.fetchNext();

                self.$el.find('.versions').removeClass('hidden');

                // update original model
                fileInfoModel.trigger('busy', fileInfoModel, false);
                fileInfoModel.set({
                  size: versionModel.get('size'),
                  mtime: versionModel.get('timestamp') * 1000,
                  // temp dummy, until we can do a PROPFIND
                  etag: versionModel.get('id') + versionModel.get('timestamp')
                });
                self.versionCounter = 0;
              },

              error: function() {
                OC.Notification.showTemporary(
                  t('files_version', 'Failed to revert {file} to revision {timestamp}.', {
                    file: versionModel.getFullPath(),
                    timestamp: OC.Util.formatDate(versionModel.get('timestamp') * 1000)
                  })
                );
              }
            });
          }
          else {
            // reset and re-fetch the updated collection
            self.$versionsContainer.empty();
            self.collection.setFileInfo(fileInfoModel);
            self.collection.reset([], {silent: true});
            self.collection.fetchNext();

            self.$el.find('.versions').removeClass('hidden');

            // update original model
            fileInfoModel.trigger('busy', fileInfoModel, false);
            fileInfoModel.set({
              size: versionModel.get('size'),
              mtime: versionModel.get('timestamp') * 1000,
              // temp dummy, until we can do a PROPFIND
              etag: versionModel.get('id') + versionModel.get('timestamp')
            });
            self.versionCounter = 0;
          }
          // spinner
          self._toggleLoading(true);
          fileInfoModel.trigger('busy', fileInfoModel, true);
        }
      );
		},


		_toggleLoading: function(state) {
			this._loading = state;
			this.$el.find('.loading').toggleClass('hidden', !state);
		},

		_onRequest: function() {
			this._toggleLoading(true);
			this.$el.find('.showMoreVersions').addClass('hidden');
		},

		_onEndRequest: function() {
			this._toggleLoading(false);
			this.$el.find('.empty').toggleClass('hidden', !!this.collection.length);
			this.$el.find('.showMoreVersions').toggleClass('hidden', !this.collection.hasMoreResults());
		},

		_onAddModel: function(model) {
      if(this.versionCounter == 0) {
        this.$versionsContainer.append(this.itemTemplateInit({
          preserve: t('files_versions', 'Preserve versions'),
          historic: t('files_versions', 'Historic versions')
        }));
      }

      if(!model.get('historic')) {
        this.$versionsContainer.find('#historic').before(this.itemTemplate(this._formatItem(model)));
      }
      else {
        this.$versionsContainer.find('#hideversion').before(this.itemTemplate(this._formatItem(model)));
      }

      this.versionCounter++;
		},

		template: function(data) {
			if (!this._template) {
				this._template = Handlebars.compile(TEMPLATE);
			}

			return this._template(data);
		},

		itemTemplateInit: function(data) {
			if (!this._itemTemplateInit) {
				this._itemTemplateInit = Handlebars.compile(TEMPLATE_ITEM_INIT);
			}

			return this._itemTemplateInit(data);
		},

		itemTemplate: function(data) {
			if (!this._itemTemplate) {
				this._itemTemplate = Handlebars.compile(TEMPLATE_ITEM);
			}

			return this._itemTemplate(data);
		},

		setFileInfo: function(fileInfo) {
			if (fileInfo) {
        this.versionCounter = 0;
        this.render();
        this.collection.setFileInfo(fileInfo);
        this.collection.reset([], {silent: true});
        this.nextPage();
			} else {
				this.render();
				this.collection.reset();
			}
		}, 

		_formatItem: function(version) {
      var self = this;
			var timestamp = version.get('timestamp') * 1000;
			return _.extend({
				formattedTimestamp: OC.Util.formatDate(timestamp),
				relativeTimestamp: OC.Util.relativeModifiedDate(timestamp),
				downloadUrl: version.getDownloadUrl(),
				downloadIconUrl: OC.imagePath('core', 'actions/download'),
				revertIconUrl: OC.imagePath('core', 'actions/history'),
				deleteIconUrl: OC.imagePath('core', 'actions/delete'),
				previewUrl: version.getPreviewUrl(),
				revertLabel: t('files_versions', 'Restore'),
				deleteLabel: t('files_versions', 'Delete'),
        deletable: true,
			}, version.attributes);
		},

		/**
		 * Renders this details view
		 */
		render: function() {
			this.$el.html(this.template({
				emptyResultLabel: t('files_versions', 'No other versions available'),
				moreVersionsLabel: t('files_versions', 'More versions...')
			}));
			this.$el.find('.has-tooltip').tooltip();
			this.$versionsContainer = this.$el.find('ul.versions');
			this.delegateEvents();
		},

		/**
		 * Returns true for files, false for folders.
		 *
		 * @return {bool} true for files, false for folders
		 */
		canDisplay: function(fileInfo) {
			if (!fileInfo) {
				return false;
			}

      if(!fileInfo.isDirectory() && fileInfo.attributes.path === '/' || fileInfo.attributes.mountType == 'shared-root' || fileInfo.attributes.mountType == 'shared') {
        return false;
      }

			return true;
		}
	});

	OCA.Versions = OCA.Versions || {};

	OCA.Versions.VersionsTabView = VersionsTabView;
})();
