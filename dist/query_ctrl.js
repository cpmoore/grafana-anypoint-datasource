'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.GenericDatasourceQueryCtrl = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _sdk = require('app/plugins/sdk');

require('./css/query-editor.css!');

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var GenericDatasourceQueryCtrl = exports.GenericDatasourceQueryCtrl = function (_QueryCtrl) {
    _inherits(GenericDatasourceQueryCtrl, _QueryCtrl);

    function GenericDatasourceQueryCtrl($scope, $injector) {
        _classCallCheck(this, GenericDatasourceQueryCtrl);

        var _this = _possibleConstructorReturn(this, (GenericDatasourceQueryCtrl.__proto__ || Object.getPrototypeOf(GenericDatasourceQueryCtrl)).call(this, $scope, $injector));

        _this.target.type = _this.target.type || 'ACCOUNT_RESOURCES';
        _this.target.organization = _this.target.organization || '';
        _this.target.environment = _this.target.environment || '';
        _this.target.resource = _this.target.resource || 'ALL';
        _this.target.metric = _this.target.metric || '';
        _this.target.legendFormat = _this.target.legendFormat || '';
        _this.target.metricTarget = _this.target.metricTarget || '';
        _this.target.aggregation = _this.target.aggregation || 'avg';
        _this.refresh = _this.panelCtrl.refresh;
        _this.metricAggregationTypes = ['avg', 'min', 'max', 'sum', 'count'];
        _this.targetTypes = [{ 'value': 'ACCOUNT_RESOURCES', 'text': "Account Resources" }, { 'value': 'RUNTIME_MANAGER_RESOURCES', 'text': "Runtime Manager Resources" }, { 'value': 'RUNTIME_MANAGER_METRICS', 'text': "Runtime Manager Metrics" }];
        _this.resourceTypes = {
            'ACCOUNT_RESOURCES': [{ 'value': 'ALL', 'text': 'All' }, { 'value': 'ORGANIZATION', 'text': 'Organizations' }, { 'value': 'ENVIRONMENT', 'text': 'Environments' }],
            'RUNTIME_MANAGER_RESOURCES': [{ 'value': 'ALL', 'text': 'All' }, { 'value': 'APPLICATION', 'text': 'Applications' }, { 'value': 'SERVER', 'text': 'Servers' }, { 'value': 'SERVER_GROUP', 'text': 'Server Groups' }, { 'value': 'CLUSTER', 'text': 'Clusters' }],
            'RUNTIME_MANAGER_METRICS': [{ 'value': 'APPLICATION', 'text': 'Applications' }, { 'value': 'SERVER', 'text': 'Servers' }]
        };
        return _this;
    }

    _createClass(GenericDatasourceQueryCtrl, [{
        key: 'getMetricTargets',
        value: function getMetricTargets() {
            var _this2 = this;

            var found = new Set();
            var all = [];
            return new Promise(function (resolve, reject) {
                _this2.datasource.promiseMultipleEnvironments({
                    organization: _this2.target.organization,
                    environment: _this2.target.environment
                }, function (org, env) {
                    return _this2.datasource.getRuntimeManagerResourceList(org, env);
                }).then(function (rowlist) {
                    for (var i1 = 0; i1 < rowlist.length; i1++) {
                        var rows = rowlist[i1];
                        for (var i = 0; i < rows.length; i++) {
                            if (rows[i].type !== _this2.target.resource || found.has(rows[i].name)) {
                                continue;
                            }
                            found.add(rows[i].name);
                            all.push({ value: rows[i].name, text: rows[i].name });
                        }
                    }
                    resolve(all.sort(function (a, b) {
                        return a.text.localeCompare(b.text);
                    }));
                }).catch(function (error) {
                    console.log(error);
                });
            });
        }
    }, {
        key: 'getMetricTypes',
        value: function getMetricTypes() {
            var _this3 = this;

            return new Promise(function (resolve) {
                var z = [];
                if (_this3.target.resource === 'SERVER') {
                    z = ["class-loading-unloaded", "memory-usage", "thread-count", "tenured-gen-committed", "compressed-class-space-usage", "class-loading-total", "survivor-usage", "gc-mark-sweep-count", "compressed-class-space-committed", "gc-mark-sweep-time", "survivor-total", "tenured-gen-total", "memory-committed", "cpu-usage", "gc-par-new-count", "metaspace-committed", "code-cache-total", "gc-par-new-time", "survivor-committed", "code-cache-usage", "eden-total", "tenured-gen-usage", "eden-committed", "metaspace-total", "load-average", "memory-total", "class-loading-loaded", "metaspace-usage", "eden-usage", "compressed-class-space-total", "available-processors"];
                } else if (_this3.target.resource === 'APPLICATION') {
                    z = ['error-count', 'message-count', 'response-time'];
                }
                resolve(z.sort().map(function (y) {
                    return { 'value': y, 'text': y };
                }));
            });
        }
    }, {
        key: 'getResourceTypes',
        value: function getResourceTypes() {
            var _this4 = this;

            return new Promise(function (resolve) {
                resolve(_this4.resourceTypes[_this4.target.type] || []);
            });
        }
    }, {
        key: 'getOrganizations',
        value: function getOrganizations() {
            var _this5 = this;

            return new Promise(function (resolve) {
                if (_this5.datasource.organizationCache.list.length) {
                    if (_this5.target.type.endsWith('_RESOURCES')) {
                        return resolve([{ 'value': '*', 'text': "All" }].concat(_toConsumableArray(_this5.datasource.organizationCache.list)));
                    } else {
                        return resolve(_this5.datasource.organizationCache.list);
                    }
                }
                setTimeout(function () {
                    _this5.getOrganizations().then(resolve);
                }, 1000);
            });
        }
    }, {
        key: 'getEnvironments',
        value: function getEnvironments() {
            var _this6 = this;

            return this.datasource.promiseMultipleEnvironments({
                organization: this.target.organization,
                environment: '*'
            }, function (org, env, orgName, envName) {
                return envName;
            }).then(function (d) {
                var all = [];
                if (_this6.target.type.endsWith('_RESOURCES')) {
                    all.push({ 'value': '*', 'text': "All" });
                }
                var found = new Set();
                for (var i = 0; i < d.length; i++) {
                    if (!found.has(d[i])) {
                        found.add(d[i]);
                        all.push({ value: d[i], text: d[i] });
                    }
                }
                return all;
            });
        }
    }, {
        key: 'onTargetTypeChange',
        value: function onTargetTypeChange() {
            if (!this.target.type.endsWith('_RESOURCES')) {
                if (this.target.organization === '*') {
                    this.target.organization = '';
                }
                if (this.target.environment === '*') {
                    this.target.environment = '';
                }
            }
            var x = this.resourceTypes[this.target.type] || [];
            if (x.length) {
                this.target.resource = x[0].value;
            }
            this.refresh();
        }
    }]);

    return GenericDatasourceQueryCtrl;
}(_sdk.QueryCtrl);

GenericDatasourceQueryCtrl.templateUrl = 'partials/query.editor.html';
//# sourceMappingURL=query_ctrl.js.map
