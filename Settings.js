(function() {
    var Ext = window.Ext4 || window.Ext;

    /**
     *
     */
    Ext.define('Rally.app.App', {
        alias: 'widget.rallyapp',
        extend: 'Ext.Container',
        requires: [
            'Rally.data.PreferenceManager',
            'Rally.state.SessionStorageProvider',
            'Rally.app.Message',
            'Rally.app.TimeboxScope',
            'Rally.app.settings.Loader'
        ],
        mixins: [
            'Rally.Messageable',
            'Rally.clientmetrics.ClientMetricsRecordable'
        ],
        autoScroll: true,
        config: {
            /**
             * @cfg {Rally.app.Context} context The runtime context.  This is automatically provided
             * to the app at the time of construction by its container.
             */
            context: undefined,

            /**
             * @cfg {Object}
             * App settings, loaded from server and passed into app when it's loaded.
             * To add new settings, use #updateSettingsValues.
             */
            settings: {},

            /**
             * @cfg {Object}
             * Default App Settings, these are used if no setting is found of a certain name
             */
            defaultSettings: {}
        },

        /**
         * @protected
         * @property {String} appName The name of the app, this will be used for metrics.
         */
        appName: undefined,

        /**
         * @property {String} settingsScope The scope with which to read/save settings
         * Supported values: "app", "workspace", "project"
         */
        settingsScope: 'app',

        /**
         * @cfg
         * If set to true and the dashboard is scoped to an iteration or release, components
         * in this app should filter their results using context.getTimeboxScope().getQueryFilter()
         */
        useTimeboxScope: false,

        constructor: function(config) {
            this.mergeConfig(config);
            this.callParent([this.config]);
        },

        initEvents: function() {
            this.callParent(arguments);

            this.addEvents(
                /**
                 * @event
                 * Fires when the content of the app has changed
                 * @param {Rally.app.App} this
                 */
                'contentupdated',

                /**
                 * @event
                 * Fires when a preference within the app has been saved
                 * @param {Rally.app.App} this
                 */
                'preferencesaved'
            );
        },

        initComponent: function() {
            this.callParent(arguments);

            if(this.getAppId()) {
                this._loadSettings().then({
                    success: this._applyDefaultSettingsAndLaunch,
                    scope: this
                });
            } else {
                this._applyDefaultSettingsAndLaunch({});
            }

            this.addCls('rally-app');

            this.subscribe(this, Rally.app.Message.timeboxScopeChange, this.onTimeboxScopeChange, this);
        },

        _loadSettings: function() {
            return Rally.app.settings.Loader.load({
                requester: this,
                appSettings: this.settings,
                context: this.getContext(),
                scope: this,
                settingsScope: this.settingsScope,
                // These scoped settings are passed through
                // from the dashboard config.
                //
                // Scoped settings can be falsey if the app is
                // running outside of a dashboard, or is being
                // re-rendered after its settings have been edited.
                //
                // If scoped settings are falsey, then
                // the Loader will load them from wsapi.
                appScopedSettings: this.appScopedSettings,
                workspaceScopedSettings: this.workspaceScopedSettings,
                projectScopedSettings: this.projectScopedSettings,
                userScopedSettings: this.userScopedSettings
            }).then({
                success: this._onSettingsLoaded,
                scope: this
            });
        },

        _areDifferentProjects: function(projectRefA, projectRefB) {
            return Rally.util.Ref.getOidFromRef(projectRefA) !== Rally.util.Ref.getOidFromRef(projectRefB);
        },

        _getSettingsScopedProjectRef: function(settings, context) {
            var contextProject = context.getProject(),
                settingsProject = settings.project;

            if (this._hasAppProjectSettings(settingsProject, contextProject)) {
                return settingsProject;
            }

            if (this._hasDashboardProjectSettings(contextProject)) {
                return '/project/' + contextProject;
            }
        },

        _hasAppProjectSettings: function(settingsProject, contextProject) {
            // Ext4 case -- project pinning was done via preferences
            return settingsProject && this._areDifferentProjects(settingsProject, contextProject._ref);
        },

        _hasDashboardProjectSettings: function(contextProject) {
            // Ext2 case -- project pinning came from the dashboard context
            return Ext.isNumber(contextProject);
        },

        _onSettingsLoaded: function(settings) {
            var projectRef = this._getSettingsScopedProjectRef(settings, this.getContext());

            if (projectRef) {
                return this._loadProject(projectRef).then({
                    success: function(project) {return this._setSettingsScopedProject(settings, project);},
                    failure: function(message) {
                        this.add({
                            xtype: 'panel',
                            cls: 'no-data',
                            html: '<p>' + message + '</p>'
                        });
                    },
                    scope: this
                });
            }

            return Deft.Promise.when(settings);
        },

        _setSettingsScopedProject: function(settings, project) {
            var context = this.getContext();

            if (this._hasDashboardProjectSettings(context.getProject())) {
                // force project scoped settings to be loaded.
                this.projectScopedSettings = null;
            }

            context.setProject(project);
            context.setWorkspace(project.get('Workspace'));
            context.put('projectScopeDown', settings.projectScopeDown);
            context.put('projectScopeUp', settings.projectScopeUp);

            return this._loadSettings();
        },

        _loadProject: function(projectRef) {
            var deferred = new Deft.Deferred(),
                projectOid = Rally.util.Ref.getOidFromRef(projectRef),
                me = this;

            Rally.data.ModelFactory.getModel({
                type: 'Project'
            }).then(function(ProjectModel) {
                me.recordLoadBegin({
                    description: 'loading the project'
                });

                ProjectModel.load(projectOid, {
                    requester: me,
                    fetch: ['ObjectID', 'Name', 'Workspace', 'SchemaVersion', 'WorkspaceConfiguration', 'DateFormat', 'DateTimeFormat', 'DragDropRankingEnabled', 'BuildandChangesetEnabled', 'TimeZone', 'WorkDays'],
                    success: function(project) {
                        me.recordLoadEnd();
                        deferred.resolve(project);
                    },
                    failure: function(record, operation) {
                        me.recordLoadEnd();
                        deferred.reject(operation.getError().errors[0]);
                    }
                });
            });

            return deferred.promise;
        },

        afterRender: function(){
            this.callParent(arguments);

            this.el.ddScrollConfig = {
                frequency: 450,
                hthresh: 25,
                increment: 120,
                vthresh: 120
            };
            Ext.dd.ScrollManager.register(this.el);
        },

        onDestroy: function(){
            if (this.el) {
                Ext.dd.ScrollManager.unregister(this.el);
            }

            this.callParent(arguments);
        },

        _applyDefaultSettingsAndLaunch: function(scopedSettings) {
            Ext.apply(this.settings, scopedSettings);
            Ext.applyIf(this.settings, this.defaultSettings);
            this.launch();
        },

        /**
         * Get the value of the setting with the specified name.
         * This method will perform automatic conversion of boolean/integer types
         * @param name the name of the setting to get
         * @return {String|Number|Boolean} the setting value
         */
        getSetting: function(name) {
            var settingValue = this.getSettings()[name];
            if (settingValue === "true") {
                return true;
            } else if (settingValue === "false") {
                return false;
            } else if (!isNaN(settingValue) && !isNaN(parseFloat(settingValue))) {
                return parseFloat(settingValue);
            }
            return settingValue;
        },

        /**
         * Update the settings for this app in preferences.
         * Provide a settings hash and this will update existing prefs or create new prefs.
         * @param options.settings the settings to create/update
         * @param options.success called when the prefs are loaded
         * @param options.scope scope to call success with
         */
        updateSettingsValues: function(options) {
            Rally.data.PreferenceManager.update(Ext.apply(this._getAppSettingsLoadOptions(), {
                requester: this,
                settings: options.settings,
                success: function(updatedSettings) {
                    Ext.apply(this.settings, updatedSettings);

                    if (options.success) {
                        options.success.call(options.scope);
                    }
                },
                scope: this
            }));
        },

        /**
         * Remove a setting for this app in preferences.
         * @param options.name the name of the setting to remove
         * @param options.success called when the prefs are loaded
         * @param options.scope scope to call success with
         */
        removeSetting: function(options) {
            Rally.data.PreferenceManager.remove(Ext.apply(this._getAppSettingsLoadOptions(), {
                requester: this,
                filterByName: options.name,
                success: function() {
                    delete this.settings[options.name];

                    if (options.success) {
                        options.success.call(options.scope);
                    }
                },
                scope: this
            }));
        },

        _getAppSettingsLoadOptions: function(settingsScope) {
            settingsScope = settingsScope || this.settingsScope;

            var loadOptions = {
                appID: this.getAppId()
            };
            if (settingsScope === 'project') {
                loadOptions.project = this.getContext().getProject();
            } else if (settingsScope === 'workspace') {
                loadOptions.workspace = this.getContext().getWorkspace();
            }
            return loadOptions;
        },

        /**
         * Only available when running in Rally, not available when run externally.
         * Used by App Settings, so if you are running externally you will not get server-persisted settings.
         *
         * @return the app id of this app.
         */
        getAppId: function() {
            return this.getContext().get('appID');
        },

        /**
         * @method getContext
         * Get the current context in which the app is running.
         * See [Context](#!/guide/context) for more information on working with context in apps.
         * @return {Rally.app.Context}
         */

        /**
         * Called automatically when the app is ready to execute.
         * This method represents the entry point for the app and should be overridden in sub classes.
         * @template
         */
        launch: Ext.emptyFn,

        /**
         * @template
         * Called to populate the containing panel's gear menu with options.
         * @return {Object[]} an array of menu option config objects.
         *
         *      [{
         *          text: 'Option 1', //menu option text
         *          handler: this._onOption1Clicked, //function called when menu item is selected
         *          scope: this, //optional scope for handler
         *          order: 1  //optional order
         *      }]
         */
        getOptions: function() {
            return [];
        },

        /**
         * @template
         * Called to populate the app's settings dialog.
         * Title and project scoping are already handled and not necessary to be included here.
         *
         * For more detailed information on specifying settings for apps see the [Settings](#!/guide/settings) guide.
         *
         * @return {Object[]} an array of settings objects compatible with Rally.app.AppSettings#fields.
         *
         *      [{
         *          name: 'setting1' //setting name
         *          xtype: 'rallycheckboxfield' //field type
         *      },
         *      {
         *          name: 'setting2' //setting name
         *          xtype: 'rallytextfield' //field type
         *      }]
         */
        getSettingsFields: function() {
            return [];
        },

        /**
         * Flip the app into settings mode.  Draws a settings form with the fields
         * returned from #getSettingsFields.
         * @param options
         * @returns {*}
         */
        showSettings: function(options) {
            this._appSettings = Ext.create('Rally.app.AppSettings', Ext.apply({
                fields: this.getSettingsFields(),
                settings: this.getSettings(),
                defaultSettings: this.getDefaultSettings(),
                context: this.getContext(),
                settingsScope: this.settingsScope
            }, options));

            this._appSettings.on('cancel', this._hideSettings, this);
            this._appSettings.on('save', this._onSettingsSaved, this);

            this.hide();
            this.up().add(this._appSettings);

            return this._appSettings;
        },

        _onSettingsSaved: function(settings) {
            Ext.apply(this.settings, settings);
            this._hideSettings();
            this.onSettingsUpdate(settings);
        },

        _hideSettings: function() {
            if (this._appSettings) {
                this._appSettings.destroy();
                delete this._appSettings;
            }
            this.show();
        },

        /**
         * Called when the app's settings have been updated and the
         * app view should be refreshed
         * @template
         * @protected
         * @param Object settings the new settings
         */
        onSettingsUpdate: function(settings) {

        },

        /**
         * Called when the timebox scope changes on a timebox filtered dashboard
         * @param {Rally.app.TimeboxScope} timeboxScope the new scope
         *
         * See [Timebox Filtering](#!/guide/timebox_filtering) for more information and examples on how to implement
         * a timebox filtered app.
         *
         * @protected
         */
        onTimeboxScopeChange: function(timeboxScope) {
            this.getContext().setTimeboxScope(timeboxScope);
        }
    });
})();