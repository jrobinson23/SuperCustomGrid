            (function () {
                var Ext = window.Ext4 || window.Ext;

                Ext.define('Rally.apps.grid.GridApp', {
                    extend: 'Rally.app.App',
                    layout: 'fit',

                    requires: [
                        'Rally.data.util.Sorter',
                        'Rally.ui.combobox.FieldComboBox',
                        'Rally.ui.combobox.ComboBox',
                        'Rally.ui.picker.FieldPicker',
                        'Rally.ui.TextField',
                        'Rally.ui.NumberField',
                        'Rally.data.wsapi.Filter',
                        'Rally.ui.grid.Grid',
                        'Rally.data.ModelFactory',
                        'Rally.domain.WsapiModelBuilder',
                        'Rally.ui.grid.plugin.PercentDonePopoverPlugin'
                    ],
                

                //This section contains the settings details so that there is an editable settings panel after implementing the custom HTML code inside the app. 

                    config: {
                        defaultSettings: {
                            types: 'hierarchicalrequirement'
                        }
                    },

                    getSettingsFields: function() {
                        return [
                            {
                                name: 'type',
                                xtype: 'rallycombobox',
                                shouldRespondToScopeChange: true,
                                context: this.getContext(),
                                storeConfig: {
                                    model: Ext.identityFn('TypeDefinition'),
                                    sorters: [
                                        {
                                            property: 'Name'
                                        }
                                    ],
                                    fetch: ['DisplayName', 'ElementName', 'TypePath'],
                                    filters: [
                                        {
                                            property: 'Creatable',
                                            value: true
                                        }
                                    ],
                                    autoLoad: false,
                                    remoteSort: false,
                                    remoteFilter: true
                                },
                                displayField: 'DisplayName',
                                valueField: 'TypePath',
                                listeners: {
                                    select: function (combo, records) {
                                        combo.fireEvent('typeselected', records[0].get('TypePath'), combo.context);
                                    },
                                    ready: function (combo) {
                                        combo.store.sort('DisplayName');
                                        combo.fireEvent('typeselected', combo.getRecord().get('TypePath'), combo.context);
                                    }
                                },
                                bubbleEvents: ['typeselected'],
                                readyEvent: 'ready',
                                handlesEvents: {
                                    projectscopechanged: function (context) {
                                        this.refreshWithNewContext(context);
                                    }
                                }
                            },
                            {
                                name: 'columns',
                                fieldLabel: 'Columns',
                                xtype: 'rallyfieldpicker',
                                // alwaysSelectedValues: ['FormattedID', 'Name', 'Owner', 'BlockedReason']
                                handlesEvents: {
                                    typeselected: function(type, context) {
                                        this.refreshWithNewModelTypes([type], context);
                                    }
                                }
                            },
                            {
                                type: 'query',
                                config: {
                                    plugins: [
                                        {
                                            ptype: 'rallyhelpfield',
                                            helpId: 194
                                        },
                                        'rallyfieldvalidationui'
                                    ]
                                }
                            },
                            {
                                name: 'order',
                                xtype: 'rallytextfield'
                            }
                          ];
                    },

                    launch: function () {
                        var context = this.getContext(),
                                // pageSize = this.getSetting('pageSize'),
                                fetch = this.getSetting('columns'),
                                columns = this._getColumns(fetch);

                        this.add({
                            xtype: 'rallygrid',
                            columnCfgs: columns,
                            enableColumnHide: false,
                            enableRanking: true,
                            enableBulkEdit: true,
                            // autoScroll: gridAutoScroll,
                            //plugins: this._getPlugins(columns),
                            context: this.getContext(),
                            storeConfig: {
                                fetch: fetch,
                                models: [this.getSetting('type')],
                                filters: this._getFilters(),
                               // pageSize: pageSize,
                                sorters: Rally.data.util.Sorter.sorters(this.getSetting('order'))
                                /*listeners: {
                                    load: this._updateAppContainerSize,
                                    scope: this
                                }*/
                            }/*,
                            pagingToolbarCfg: {
                                pageSizes: [pageSize]
                            }*/
                        });
                    },

                    onTimeboxScopeChange: function (newTimeboxScope) {
                        this.callParent(arguments);

                        this.down('rallygrid').filter(this._getFilters(), true, true);
                    },

                    _getFilters: function () {
                        var filters = [],
                                query = this.getSetting('query'),
                                timeboxScope = this.getContext().getTimeboxScope();
                        if (query) {
                            try {
                                query = new Ext.Template(query).apply({
                                    user: Rally.util.Ref.getRelativeUri(this.getContext().getUser())
                                });
                            } catch (e) {
                            }
                            filters.push(Rally.data.wsapi.Filter.fromQueryString(query));
                        }

                        if (timeboxScope && this._isSchedulableType(this.getSetting('type'))) {
                            filters.push(timeboxScope.getQueryFilter());
                        }
                        return filters;
                    },

                    _isSchedulableType: function (type) {
                        return _.contains(['hierarchicalrequirement', 'task', 'defect', 'defectsuite', 'testset'], type.toLowerCase());
                    },

                    _getFetchOnlyFields: function () {
                        return ['LatestDiscussionAgeInMinutes'];
                    },

                    /*_updateAppContainerSize: function () {
                        if (this.appContainer) {
                            var grid = this.down('rallygrid');
                            grid.el.setHeight('auto');
                            grid.body.setHeight('auto');
                            grid.view.el.setHeight('auto');
                            this.setSize({height: grid.getHeight() + _.reduce(grid.getDockedItems(), function (acc, item) {
                                return acc + item.getHeight() + item.el.getMargin('tb');
                            }, 0)});
                            this.appContainer.setPanelHeightToAppHeight();
                        }
                    },*/

                    _getColumns: function (fetch) {
                        if (fetch) {
                            return Ext.Array.difference(fetch.split(','), this._getFetchOnlyFields());
                        }
                        return [];
                    }

                    
                });
            })();