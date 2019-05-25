'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.GenericDatasource = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _moment = require('moment');

var _moment2 = _interopRequireDefault(_moment);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var JSONPath = require('./lib/jsonpath-plus.min.js').JSONPath;

function jsonQueryExpression(value, variable, defaultFormatFn) {
    if (typeof value === 'string') {
        return value;
    }
    return JSON.stringify(value);
}

function asJsonArray(string) {
    if (typeof string === 'string') {
        try {
            return JSON.parse(string);
        } catch (e) {
            return [string];
        }
    } else if (Array.isArray(string)) {
        return string;
    }
    return [string];
}

var GenericDatasource = exports.GenericDatasource = function () {
    function GenericDatasource(instanceSettings, $q, backendSrv, templateSrv) {
        var _this = this;

        _classCallCheck(this, GenericDatasource);

        this.type = instanceSettings.type;
        this.url = instanceSettings.url;
        this.authData = { username: instanceSettings.jsonData.username, password: instanceSettings.jsonData.password };
        this.name = instanceSettings.name;
        this.q = $q;
        this.backendSrv = backendSrv;
        this.templateSrv = templateSrv;
        this.accessToken = null;
        this.headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        this.environmentList = {};
        this.organizationCache = { namesById: {}, idsByName: {}, list: [] };
        this.environmentCache = {};
        this.monitorCache = {};
        this.loginTimer = setTimeout(function () {
            _this.loginOrRetry();
        }, 100);
        this.loading = 0;
    }

    _createClass(GenericDatasource, [{
        key: 'loginOrRetry',
        value: function loginOrRetry() {
            var _this2 = this;

            this.login().then(function (response) {
                if (response.status === 'failure') {
                    _this2.loginTimer = setTimeout(function () {
                        _this2.loginOrRetry();
                    }, 5000);
                }
            });
        }
    }, {
        key: 'metricFindQuery',
        value: function metricFindQuery(query) {
            var interpolated = {
                target: this.templateSrv.replace(query, null)
            };

            return this.doRequest({
                url: '/search',
                data: interpolated,
                method: 'POST'
            }).then(this.mapToTextValue);
        }
    }, {
        key: 'isBusy',
        value: function isBusy() {
            return this.loadingProfile || !this.accessToken || this.loading > 0;
        }
    }, {
        key: 'query',
        value: function query(options, start) {
            var _this3 = this;

            options.targets = options.targets.filter(function (t) {
                return !t.hide;
            });
            // No valid targets, return the empty result to save a round trip.
            if (_lodash2.default.isEmpty(options.targets)) {
                return this.q.when({ data: [] });
            }
            start = start || new Date().getTime();
            if (this.isBusy()) {
                return new Promise(function (resolve, reject) {
                    setTimeout(function () {
                        _this3.query(options, start).then(resolve).catch(reject);
                    }, 1500);
                });
            }
            var allQueryPromise = _lodash2.default.map(options.targets, function (target) {
                if (target.resource) {
                    target.resourceTypes = new Set();
                    asJsonArray(_this3.templateSrv.replace(target.resource, options.scopedVars, jsonQueryExpression)).map(function (z) {
                        target.resourceTypes.add(z.toUpperCase());
                    });
                    target.includeResourceType = function (x) {
                        return target.resourceTypes.has(x) || target.resourceTypes.has('ALL');
                    };
                }
                if (target.jsonPath) {
                    target.jsonPath = _this3.templateSrv.replace(target.jsonPath, options.scopedVars, 'regex');
                }

                if (target.type === 'RUNTIME_MANAGER_RESOURCES') {
                    return _this3.doRuntimeManagerResourceQuery(target, options);
                } else if (target.type === 'ACCOUNT_RESOURCES') {
                    return _this3.doAccountResourceQuery(target, options);
                } else if (target.type === 'RUNTIME_MANAGER_METRICS') {
                    return _this3.doRuntimeManagerMetricQuery(target, options);
                } else {
                    return _this3.q.when([]);
                }
            });
            return this.q.all(allQueryPromise).then(function (responseList) {
                var result = { data: [] };
                responseList.forEach(function (response) {
                    if (!response) {
                        return;
                    }
                    if (Array.isArray(response)) {
                        response.forEach(function (y) {
                            if (Array.isArray(y)) {
                                result.data = [].concat(_toConsumableArray(result.data), _toConsumableArray(y));
                            } else {
                                result.data.push(y);
                            }
                        });
                    } else {
                        result.data.push(response);
                    }
                });
                console.log('Queries finished after ->', new Date().getTime() - start, result);
                return result;
            });
        }
    }, {
        key: 'promiseMultipleEnvironments',
        value: function promiseMultipleEnvironments(options, promiseMapper) {
            var _this4 = this;

            return new Promise(function (resolve, reject) {
                var targetOrganizations = asJsonArray(_this4.templateSrv.replace(options.organization, options.scopedVars, jsonQueryExpression));
                var targetEnvironments = asJsonArray(_this4.templateSrv.replace(options.environment, options.scopedVars, jsonQueryExpression));
                if (targetOrganizations.includes('*')) {
                    targetOrganizations = Object.keys(_this4.organizationCache.namesById);
                }

                var checked = new Set();
                var promises = [];

                var _loop = function _loop(i1) {
                    var organization = _this4.organizationCache.idsByName[targetOrganizations[i1]] || targetOrganizations[i1];
                    //organization does not exist
                    var cache = _this4.environmentCache[organization];
                    if (!cache) {
                        console.log('Organization ' + organization + ' does not exist');
                        return 'continue';
                    }
                    var orgName = _this4.organizationCache.namesById[organization];
                    var myTargets = targetEnvironments;
                    if (myTargets.includes('*')) {
                        myTargets = Object.keys(_this4.environmentCache[organization].namesById);
                    }

                    var _loop2 = function _loop2(i2) {
                        var environment = _lodash2.default.get(_this4.environmentCache, [organization, 'idsByName', myTargets[i2]]) || myTargets[i2];
                        if (checked.has(organization + '|' + environment)) {
                            return 'continue';
                        }
                        var envName = _this4.environmentCache[organization].namesById[environment];
                        checked.add(organization + '|' + environment);
                        if (!cache.idsByName[environment] && !cache.namesById[environment]) {
                            // console.log('Environment ' + environment + ' is not part of organization ' + organization, 'environment in organization are', cache.idsByName)
                            return 'continue';
                        }
                        promises.push(new Promise(function (resolve, reject) {
                            Promise.resolve(promiseMapper(organization, environment, orgName, envName)).then(resolve).catch(function (error) {
                                console.log("Could not get information for organization " + orgName + ", environment " + envName, error);
                                resolve(null);
                            });
                        }));
                    };

                    for (var i2 = 0; i2 < myTargets.length; i2++) {
                        var _ret2 = _loop2(i2);

                        if (_ret2 === 'continue') continue;
                    }
                };

                for (var i1 = 0; i1 < targetOrganizations.length; i1++) {
                    var _ret = _loop(i1);

                    if (_ret === 'continue') continue;
                }
                _this4.q.all(promises).then(resolve);
            });
        }
    }, {
        key: 'addStatusCodeForTarget',
        value: function addStatusCodeForTarget(obj, org, env) {
            var statues = ['RUNNING', 'STARTED', 'DISCONNECTED', 'STOPPED', 'DEPLOYMENT_FAILED'];
            var i = void 0;
            for (i = 0; i < statues.length; i++) {
                if (obj.status === statues[i]) {
                    break;
                }
            }
            obj.statusCode = i + 1;
            obj.organizationId = org;
            obj.environmentId = env;
            obj.organization = this.organizationCache.namesById[obj.organizationId];
            obj.environment = this.environmentCache[org].namesById[obj.environmentId];
            return obj;
        }
    }, {
        key: 'getMonitorResourceIds',
        value: function getMonitorResourceIds(array, org, env, resource, alreadyAttemptedToLoad) {
            var _this5 = this,
                _arguments = arguments;

            console.log("getting", resource, "ids for ", array, alreadyAttemptedToLoad);

            if (this.isBusy()) {
                return new Promise(function (resolve, reject) {
                    setTimeout(function () {
                        _this5.getMonitorResourceIds.apply(_this5, _arguments).then(resolve).catch(reject);
                    }, 1500);
                });
            }
            alreadyAttemptedToLoad = alreadyAttemptedToLoad || new Set();
            return new Promise(function (resolve, reject) {
                var key = org + '|' + env;
                var ids = [];

                for (var i = 0; i < array.length; i++) {
                    var y = array[i];
                    if (!_lodash2.default.get(_this5.monitorCache, [org, env, resource])) {
                        if (alreadyAttemptedToLoad.has(key)) {
                            continue;
                        }
                        alreadyAttemptedToLoad.add(key);
                        console.log("trying to load ", org, env);
                        _this5.getRuntimeManagerResourceList(org, env).then(function () {
                            _this5.getMonitorResourceIds.apply(_this5, _arguments).then(resolve).catch(reject);
                        });
                        return;
                    }

                    if (_this5.monitorCache[org][env][resource].namesById.hasOwnProperty(y)) {
                        ids.push(y);
                        continue;
                    }
                    var id = _this5.monitorCache[org][env][resource].idsByName[y];
                    if (id) {
                        ids.push(id);
                    } else if (!alreadyAttemptedToLoad.has(key)) {
                        alreadyAttemptedToLoad.add(key);
                        _this5.getRuntimeManagerResourceList(org, env).then(function () {
                            _this5.getMonitorResourceIds.apply(_this5, _arguments).then(resolve).catch(reject);
                        });
                    }
                }
                resolve(ids);
            });
        }
    }, {
        key: 'getRuntimeManagerResourceList',
        value: function getRuntimeManagerResourceList(org, env) {
            var _this6 = this;

            this.loading++;
            return this.doRequest({
                url: '/armui/api/v1/servers',
                headers: {
                    'X-ANYPNT-ORG-ID': org,
                    'X-ANYPNT-ENV-ID': env
                }
            }).then(function (data) {
                data = _lodash2.default.get(data, ['data', 'data']);
                if (!data || !data.length) {
                    _this6.loading--;
                    return [];
                }
                if (!_this6.monitorCache.hasOwnProperty(org)) {
                    _this6.monitorCache[org] = {};
                }
                _this6.monitorCache[org][env] = { 'SERVER': { idsByName: {}, namesById: {} }, 'APPLICATION': { idsByName: {}, namesById: {} } };
                var rows = [];
                for (var i = 0; i < data.length; i++) {
                    var deployments = data[i].deployments || [];
                    for (var i2 = 0; i2 < deployments.length; i2++) {
                        var deployment = deployments[i2].artifact;
                        deployment.status = deployments[i2].lastReportedStatus;
                        deployment.id = deployments[i2].id;
                        deployment.type = 'APPLICATION';
                        _this6.monitorCache[org][env].APPLICATION.namesById[deployment.id] = deployment.name;
                        _this6.monitorCache[org][env].APPLICATION.idsByName[deployment.name] = deployment.id;
                        rows.push(_this6.addStatusCodeForTarget(deployment, org, env));
                    }

                    if (data[i].details && data[i].details.servers) {
                        var servers = data[i].details.servers;
                        for (var _i = 0; _i < servers.length; _i++) {
                            var server = servers[_i].details;
                            server.id = servers[_i].id;
                            server.name = servers[_i].name;
                            _this6.monitorCache[org][env].SERVER.namesById[server.id] = server.name;
                            _this6.monitorCache[org][env].SERVER.idsByName[server.name] = server.id;
                            server.status = servers[_i].status;
                            server.type = 'SERVER';
                            server.parent = data[i].name;
                            server.parentType = data[i].type;
                            server.addresses = JSON.stringify(server.addresses);
                            rows.push(_this6.addStatusCodeForTarget(server, org, env));
                        }
                    }
                    rows.push(_this6.addStatusCodeForTarget(data[i], org, env));
                }
                _this6.loading--;
                return rows;
            }).catch(function (err) {
                _this6.loading--;
                return [];
            });
        }
    }, {
        key: 'doRuntimeManagerMetricQuery',
        value: function doRuntimeManagerMetricQuery(target, options) {
            var _this7 = this;

            target.aggregation = (target.aggregation || 'avg').toLowerCase();
            var loadSet = new Set();
            var metricList = [];
            asJsonArray(this.templateSrv.replace(target.metric, options.scopedVars, jsonQueryExpression)).forEach(function (y) {
                metricList = [].concat(_toConsumableArray(metricList), _toConsumableArray(y.split(',')));
            });
            var response = [];
            var endpoint = target.resource === 'SERVER' ? 'targets' : 'applications';
            return this.promiseMultipleEnvironments({
                scopedVars: options.scopedVars,
                environment: target.environment,
                organization: target.organization
            }, function (org, env) {
                return _this7.getMonitorResourceIds(asJsonArray(_this7.templateSrv.replace(target.metricTarget, options.scopedVars, jsonQueryExpression)), org, env, target.resource, loadSet).then(function (serverIds) {

                    return _this7.doRequest({
                        url: '/monitoring/query/api/v1/organizations/' + org + '/environments/' + env + '/' + endpoint + '?from=' + options.range.from.toISOString() + '&to=' + options.range.to.toISOString() + '&detailed=true',
                        method: 'POST',
                        data: { "ids": serverIds }
                    }).then(function (data) {
                        data = data.data[endpoint];
                        var set = new Set();
                        for (var z = 0; z < metricList.length; z++) {
                            var metric = metricList[z].trim();
                            if (set.has(metric)) {
                                continue;
                            }
                            set.add(metric);
                            for (var i = 0; i < data.length; i++) {
                                var y = data[i];
                                if (!y.metrics[metric]) {
                                    continue;
                                }
                                var points = [];
                                for (var i1 = 0; i1 < y.metrics[metric].values.length; i1++) {
                                    var m = y.metrics[metric].values[i1];
                                    var time = +((0, _moment2.default)(m.time).unix() + '000');
                                    points.push([m[target.aggregation], time]);
                                }
                                response.push({
                                    target: _this7.createMetricLabel({
                                        'metric': metric,
                                        'aggregation': target.aggregation,
                                        'resource': _this7.monitorCache[org][env][target.resource].namesById[y.id],
                                        'organization': _this7.organizationCache.namesById[org],
                                        'environment': _this7.environmentCache[org].namesById[env]
                                    }, target.legendFormat),
                                    datapoints: points.sort(function (a, b) {
                                        return a[1] - b[1];
                                    })
                                });
                            }
                        }
                        return response;
                    });
                }).catch(function (e) {
                    console.log(e);
                    return response;
                });
            });
        }
    }, {
        key: 'renderTemplate',
        value: function renderTemplate(aliasPattern, aliasData) {
            var aliasRegex = /\{\{\s*(.+?)\s*\}\}/g;
            return aliasPattern.replace(aliasRegex, function (match, g1) {
                if (aliasData[g1]) {
                    return aliasData[g1];
                }
                return g1;
            });
        }
    }, {
        key: 'createMetricLabel',
        value: function createMetricLabel(z, format) {
            if (!format) {
                var s = '';
                for (var y in z) {
                    s += y + '=' + JSON.stringify(z[y]) + ', ';
                }
                return "{" + s.substring(0, s.length - 2) + "}";
            }
            return this.renderTemplate(this.templateSrv.replace(format), z);
        }
    }, {
        key: 'doAccountResourceQuery',
        value: function doAccountResourceQuery(target, options) {
            var _this8 = this;

            var targetOrganizations = asJsonArray(this.templateSrv.replace(target.organization, options.scopedVars, jsonQueryExpression));
            if (targetOrganizations.includes('*')) {
                targetOrganizations = Object.keys(this.organizationCache.namesById);
            }
            var columns = ['name', 'id', 'clientId', 'resourceType'];
            var rows = [];
            return this.getMyProfile(false).then(function (response) {
                var list = response.data.user.memberOfOrganizations;
                if (target.includeResourceType('ORGANIZATION')) {
                    for (var i = 0; i < list.length; i++) {
                        if (targetOrganizations.includes(list[i].id) || targetOrganizations.includes(list[i].name)) {
                            rows.push(list[i]);
                        }
                    }
                    columns = [].concat(_toConsumableArray(columns), ['createdAt', 'domain', 'idprovider_id', 'isFederated', 'isMaster', 'ownerId', 'parentId', 'parentName', 'updatedAt', 'parentOrganizationIds', 'subOrganizationIds', 'tenantOrganizationIds']);
                }
                var promises = [];
                if (target.includeResourceType('ENVIRONMENT')) {
                    columns = [].concat(_toConsumableArray(columns), ['organization', 'organizationId', 'isProduction', 'type']);
                    for (var _i2 = 0; _i2 < list.length; _i2++) {
                        if (targetOrganizations.includes(list[_i2].id) || targetOrganizations.includes(list[_i2].name)) {
                            promises.push(_this8.getEnvironments(list[_i2].id));
                        }
                    }
                }
                return _this8.q.all(promises).then(function (x) {
                    for (var _i3 = 0; _i3 < x.length; _i3++) {

                        var envs = x[_i3].data.data;
                        for (var i2 = 0; i2 < envs.length; i2++) {
                            var env = envs[i2];
                            env.resourceType = 'ENVIRONMENT';
                            env.organization = _this8.organizationCache.namesById[env.organizationId];
                            rows.push(env);
                        }
                    }
                    columns = columns.map(function (x, i) {
                        if (typeof x === 'string') {
                            return { text: x, type: 'string' };
                        }
                    });
                    if (target.jsonPath) {
                        rows = JSONPath({ path: target.jsonPath, json: rows });
                    }
                    if (options.returnFullResponse) {
                        return rows;
                    }
                    var response = {
                        columns: columns,
                        rows: rows.map(function (obj) {
                            return columns.map(function (x) {
                                return obj[x.text] || '';
                            });
                        }),
                        type: 'table'
                    };
                    return response;
                });
            });
        }
    }, {
        key: 'doRuntimeManagerResourceQuery',
        value: function doRuntimeManagerResourceQuery(target, options) {
            var _this9 = this;

            var columns = [{ 'text': 'type', 'type': 'string' }, { 'text': 'name', 'type': 'string' }, { 'text': 'organization', 'type': 'string' }, { 'text': 'environment', 'type': 'string' }, { 'text': 'status', 'type': 'string' }, { 'text': 'id', 'type': 'string' }, { 'text': 'organizationId', 'type': 'string' }, { 'text': 'environmentId', 'type': 'string' }, { 'text': 'statusCode', 'type': 'number' }];
            if (target.includeResourceType('APPLICATION')) {
                columns = [].concat(_toConsumableArray(columns), [{ 'text': 'fileChecksum', 'type': 'string' }, { 'text': 'fileName', 'type': 'string' }, { 'text': 'lastUpdateTime', 'type': 'string' }]);
            }
            if (target.includeResourceType('SERVER')) {
                columns = [].concat(_toConsumableArray(columns), [{ 'text': 'agentVersion', 'type': 'string' }, { 'text': 'runtimeVersion', 'type': 'string' }, { 'text': 'currentClusteringIp', 'type': 'string' }, { 'text': 'addresses', 'type': 'string' }, { 'text': 'parent', 'type': 'string' }, { 'text': 'parentType', 'type': 'string' }]);
            }
            return this.promiseMultipleEnvironments({
                scopedVars: options.scopedVars,
                environment: target.environment,
                organization: target.organization
            }, function (org, env) {
                var response = { columns: columns, rows: [], type: 'table' };
                return _this9.getRuntimeManagerResourceList(org, env).then(function (rows) {
                    if (!target.resourceTypes.has('ALL')) {
                        rows = rows.filter(function (y) {
                            return target.resourceTypes.has(y.type);
                        });
                    }
                    if (target.jsonPath) {
                        rows = JSONPath({ path: target.jsonPath, json: rows });
                    }
                    if (options.returnFullResponse) {
                        return rows;
                    }
                    response.rows = rows.map(function (obj) {
                        return columns.map(function (x) {
                            return obj[x.text];
                        });
                    });
                    return response;
                }).catch(function () {
                    return response;
                });
            });
        }
    }, {
        key: 'login',
        value: function login() {
            var _this10 = this;

            clearTimeout(this.loginTimer);
            console.log('Getting access token');
            this.accessToken = '';
            return this.doRequest({
                url: '/accounts/login',
                method: 'POST',
                data: this.authData
            }).then(function (response) {
                _this10.accessToken = response.data.access_token;
                return _this10.getMyProfile().then(function (r) {
                    r = r.data.access_token;
                    var time = 1000 * r.expires_in - 30;
                    if (time < 10000) {
                        time = 10000;
                    }
                    console.log("reauthenticating in", time);
                    _this10.loginTimer = setTimeout(function () {
                        _this10.loginOrRetry();
                    }, time);
                    return {
                        status: "success",
                        message: "Data source is working, found " + _this10.organizationCache.list.length + " organizations"
                    };
                });
            }).catch(function (error) {
                _this10.accessToken = null;
                return { status: "failure", message: "Invalid url or credentials." };
            });
        }
    }, {
        key: 'testDatasource',
        value: function testDatasource() {
            return this.login();
        }
    }, {
        key: 'getMyProfile',
        value: function getMyProfile(includeEnvironments) {
            var _this11 = this;

            this.loadingProfile = true;
            return this.doRequest({
                url: '/accounts/api/me',
                method: 'GET'
            }).then(function (response) {
                _this11.organizationCache.list = response.data.user.memberOfOrganizations.map(function (o, i) {
                    response.data.user.memberOfOrganizations[i].resourceType = 'ORGANIZATION';
                    _this11.organizationCache.idsByName[o.name] = o.id;
                    _this11.organizationCache.namesById[o.id] = o.name;
                    if (includeEnvironments !== false) {
                        _this11.getEnvironments(o.id);
                    }
                    return { text: o.name, value: o.id };
                });
                _this11.loadingProfile = false;
                return response;
            });
        }
    }, {
        key: 'getEnvironments',
        value: function getEnvironments(targetOrganization) {
            var _this12 = this;

            this.loading++;
            var organization = this.templateSrv.replace(targetOrganization, null);
            if (targetOrganization !== organization && this.organizationCache.idsByName[organization]) {
                organization = this.organizationCache.idsByName[organization];
            }
            return this.doRequest({
                url: '/accounts/api/organizations/' + organization + '/environments',
                method: 'GET'
            }).then(function (response) {
                _this12.environmentCache[organization] = { idsByName: {}, namesById: {} };
                _this12.environmentList[organization] = [{ 'text': 'All', value: '*' }].concat(_toConsumableArray(response.data.data.map(function (o) {
                    _this12.environmentCache[organization].idsByName[o.name] = o.id;
                    _this12.environmentCache[organization].namesById[o.id] = o.name;
                    return { text: o.name, value: o.name };
                })));
                _this12.loading--;
                _this12.environmentList[organization];
                return response;
            }).catch(function (err) {
                _this12.loading--;
                throw err;
            });
        }
    }, {
        key: 'mapToTextValue',
        value: function mapToTextValue(result) {
            if ((typeof result === 'undefined' ? 'undefined' : _typeof(result)) === 'object' && !Array.isArray(result)) {
                result = result.data;
            }
            return _lodash2.default.map(result, function (d, i) {
                if (d && d.id && d.name) {
                    return { text: d.name, value: d.id };
                } else if (_lodash2.default.isObject(d)) {
                    return { text: d, value: i };
                }
                return { text: d, value: d };
            });
        }
    }, {
        key: 'doRequest',
        value: function doRequest(options) {
            var _this13 = this;

            options.headers = options.headers || {};
            var isLogin = true;
            if (!options.url.endsWith('/accounts/login')) {
                isLogin = false;
                if (this.accessToken == null) {
                    this.login();
                }
                if (this.accessToken === '') {
                    return new Promise(function (resolve, reject) {
                        setTimeout(function () {
                            _this13.doRequest(options).then(resolve).catch(reject);
                        }, 1000);
                    });
                }
                options.headers['Authorization'] = 'bearer ' + this.accessToken;
            }
            for (var x in this.headers) {
                options.headers[x] = this.headers[x];
            }
            options.url = this.url + options.url;
            return this.backendSrv.datasourceRequest(options).then(function (data) {
                if (!data) {
                    throw new Error('No response received, possible invalid organization or environment.');
                } else if (data.status !== 200) {
                    throw new Error("Status code " + data.status + " received");
                }
                return data;
            }).catch(function (error) {
                if (error && error.config && error.config.headers) {
                    error.config.headers['X-DS-Authorization'] = '****';
                }
                options.headers['X-DS-Authorization'] = '****';
                options.headers['Authorization'] = '****';
                if (isLogin) {
                    console.log("Got error from login request", error);
                } else {
                    console.log('Got error from request', options, error);
                }
                throw error;
            });
        }

        // buildQueryParameters(options) {
        //   //remove placeholder targets
        //   options.targets = _.filter(options.targets, target => {
        //     return target.target !== 'select metric';
        //   });

        //   var targets = _.map(options.targets, target => {
        //     return {
        //       target: this.templateSrv.replace(target.target, options.scopedVars, 'regex'),
        //       refId: target.refId,
        //       hide: target.hide,
        //       type: target.type || 'timeserie'
        //     };
        //   });

        //   options.targets = targets;

        //   return options;
        // }

        // getTagKeys(options) {
        //   return new Promise((resolve, reject) => {
        //     this.doRequest({
        //       url: '/tag-keys',
        //       method: 'POST',
        //       data: options
        //     }).then(result => {
        //       return resolve(result.data);
        //     });
        //   });
        // }

        // getTagValues(options) {
        //   return new Promise((resolve, reject) => {
        //     this.doRequest({
        //       url: '/tag-values',
        //       method: 'POST',
        //       data: options
        //     }).then(result => {
        //       return resolve(result.data);
        //     });
        //   });
        // }

    }]);

    return GenericDatasource;
}();
//# sourceMappingURL=datasource.js.map
