'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GenericDatasource = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

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
    this.loginTimer = setTimeout(function () {
      _this.loginOrRetry();
    }, 100);
    this.loadingEnvironment = 0;
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
      return this.loadingProfile || !this.accessToken || this.loadingEnvironment > 0;
    }
  }, {
    key: 'query',
    value: function query(options) {
      var _this3 = this;

      if (this.isBusy()) {
        return new Promise(function (resolve, reject) {
          setTimeout(function () {
            _this3.query(options).then(resolve).catch(reject);
          }, 1500);
        });
      }
      // No valid targets, return the empty result to save a round trip.
      if (_lodash2.default.isEmpty(options.targets)) {
        return this.$q.when({ data: [] });
      }

      var allQueryPromise = _lodash2.default.map(options.targets, function (target) {
        if (target.type === 'RUNTIME_MANAGER_RESOURCES') {
          return _this3.doRuntimeManagerResourceQuery(target, options);
        } else if (target.type === 'ACCOUNT_RESOURCES') {
          return _this3.doAccountResourceQuery(target, options);
        } else {
          return new Promise(function (resolve, reject) {
            return resolve([]);
          });
        }
      });
      return this.q.all(allQueryPromise).then(function (responseList) {
        var result = { data: [] };
        _lodash2.default.each(responseList, function (response, index) {
          if (Array.isArray(response)) {
            result.data = [].concat(_toConsumableArray(result.data), _toConsumableArray(response));
          } else {
            result.data.push(response);
          }
        });
        return result;
      });
    }
  }, {
    key: 'promiseMultipleEnvironments',
    value: function promiseMultipleEnvironments(target, options, promiseMapper) {
      var _this4 = this;

      return new Promise(function (resolve, reject) {
        var targetOrganizations = asJsonArray(_this4.templateSrv.replace(target.organization, options.scopedVars, jsonQueryExpression));
        var targetEnvironments = asJsonArray(_this4.templateSrv.replace(target.environment, options.scopedVars, jsonQueryExpression));
        if (targetOrganizations.includes('*')) {
          targetOrganizations = Object.keys(_this4.organizationCache.namesById);
        }

        var checked = new Set();
        var promises = [];
        for (var i1 = 0; i1 < targetOrganizations.length; i1++) {
          var organization = _this4.organizationCache.idsByName[targetOrganizations[i1]] || targetOrganizations[i1];

          //organization does not exist
          var cache = _this4.environmentCache[organization];
          if (!cache) {
            console.log('Organization ' + organization + ' does not exist');
            continue;
          }
          var myTargets = targetEnvironments;
          if (myTargets.includes('*')) {
            myTargets = Object.keys(_this4.environmentCache[organization].namesById);
          }
          for (var i2 = 0; i2 < myTargets.length; i2++) {
            var environment = _lodash2.default.get(_this4.environmentCache, [organization, 'idsByName', myTargets[i2]]) || myTargets[i2];
            if (checked.has(organization + '|' + environment)) {
              continue;
            }
            checked.add(organization + '|' + environment);
            if (!cache.idsByName[environment] && !cache.namesById[environment]) {
              console.log('Environment ' + environment + ' is not part of organization ' + organization, 'environment in organization are', cache.idsByName);
              continue;
            }
            promises.push(promiseMapper(organization, environment, _this4.organizationCache.namesById[organization], _this4.environmentCache[organization].namesById[environment]));
          }
        }
        _this4.q.all(promises).then(resolve).catch(reject);
      });
    }
  }, {
    key: 'doAccountResourceQuery',
    value: function doAccountResourceQuery(target, options) {
      var _this5 = this;

      var resourceTypes = new Set();
      asJsonArray(this.templateSrv.replace(target.resource, options.scopedVars, jsonQueryExpression)).map(function (z) {
        resourceTypes.add(z.toUpperCase());
      });
      function include(x) {
        return resourceTypes.has(x) || resourceTypes.has('ALL');
      }

      var targetOrganizations = asJsonArray(this.templateSrv.replace(target.organization, options.scopedVars, jsonQueryExpression));
      if (targetOrganizations.includes('*')) {
        targetOrganizations = Object.keys(this.organizationCache.namesById);
      }
      var jsonPath = this.templateSrv.replace(target.jsonPath, options.scopedVars, 'regex');
      var columns = ['name', 'id', 'clientId', 'resourceType'];
      var rows = [];
      return this.getMyProfile(false).then(function (response) {
        var orgs = response.data.user.memberOfOrganizations;
        var includesOrganziation = false;
        if (include('ORGANIZATION')) {
          includesOrganziation = true;
          rows = [].concat(_toConsumableArray(orgs));
          columns = [].concat(_toConsumableArray(columns), ['createdAt', 'domain', 'idprovider_id', 'isFederated', 'isMaster', 'ownerId', 'parentId', 'parentName', 'updatedAt', 'parentOrganizationIds', 'subOrganizationIds', 'tenantOrganizationIds']);
        }
        var promises = [];
        if (include('ENVIRONMENT')) {
          columns = [].concat(_toConsumableArray(columns), ['organization', 'organizationId', 'isProduction', 'type']);
          for (var i = 0; i < orgs.length; i++) {
            if (targetOrganizations.includes(orgs[i].id) || targetOrganizations.includes(orgs[i].name)) {
              promises.push(_this5.getEnvironments(orgs[i].id));
            }
          }
        }
        return _this5.q.all(promises).then(function (x) {

          for (var _i = 0; _i < x.length; _i++) {

            var envs = x[_i].data.data;
            for (var i2 = 0; i2 < envs.length; i2++) {
              var env = envs[i2];
              env.resourceType = 'ENVIRONMENT';
              env.organization = _this5.organizationCache.namesById[env.organizationId];
              rows.push(env);
            }
          }
          columns = columns.map(function (x, i) {
            if (typeof x === 'string') {
              return { text: x, type: 'string' };
            }
          });
          if (jsonPath) {
            rows = JSONPath({ path: jsonPath, json: rows });
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
      var _this6 = this;

      var resourceTypes = new Set();
      asJsonArray(this.templateSrv.replace(target.resource, options.scopedVars, jsonQueryExpression)).map(function (z) {
        resourceTypes.add(z.toUpperCase());
      });
      function include(x) {
        return resourceTypes.has(x) || resourceTypes.has('ALL');
      }
      var jsonPath = this.templateSrv.replace(target.jsonPath, options.scopedVars, 'regex');
      var organizationCache = this.organizationCache;
      var environmentCache = this.environmentCache;
      return this.promiseMultipleEnvironments(target, options, function (organization, environment) {
        return _this6.doRequest({
          url: '/armui/api/v1/servers',
          headers: {
            'X-ANYPNT-ORG-ID': organization,
            'X-ANYPNT-ENV-ID': environment
          }
        });
      }).then(function (responseList) {
        return responseList.map(function (data) {
          var organization = data.config.headers['X-ANYPNT-ORG-ID'];
          var environment = data.config.headers['X-ANYPNT-ENV-ID'];
          data = data.data.data;

          var columns = [{ 'text': 'type', 'type': 'string' }, { 'text': 'name', 'type': 'string' }, { 'text': 'organization', 'type': 'string' }, { 'text': 'environment', 'type': 'string' }, { 'text': 'status', 'type': 'string' }, { 'text': 'id', 'type': 'string' }, { 'text': 'organizationId', 'type': 'string' }, { 'text': 'environmentId', 'type': 'string' }, { 'text': 'statusCode', 'type': 'number' }];
          if (include('APPLICATION')) {
            columns = [].concat(_toConsumableArray(columns), [{ 'text': 'fileChecksum', 'type': 'string' }, { 'text': 'fileName', 'type': 'string' }, { 'text': 'lastUpdateTime', 'type': 'string' }]);
          }
          if (include('SERVER')) {
            columns = [].concat(_toConsumableArray(columns), [{ 'text': 'agentVersion', 'type': 'string' }, { 'text': 'runtimeVersion', 'type': 'string' }, { 'text': 'currentClusteringIp', 'type': 'string' }, { 'text': 'addresses', 'type': 'string' }, { 'text': 'parent', 'type': 'string' }, { 'text': 'parentType', 'type': 'string' }]);
          }
          var rows = [];

          function addOne(obj) {
            var statues = ['RUNNING', 'STARTED', 'DISCONNECTED', 'STOPPED', 'DEPLOYMENT_FAILED'];
            var i = void 0;
            for (i = 0; i < statues.length; i++) {
              if (obj.status === statues[i]) {
                break;
              }
            }
            obj.statusCode = i + 1;
            obj.organizationId = organization;
            obj.environmentId = environment;
            obj.organization = organizationCache.namesById[organization];
            obj.environment = environmentCache[organization].namesById[environment];
            if (jsonPath) {
              rows.push(obj);
            } else {
              rows.push(columns.map(function (x) {
                return obj[x.text] || '';
              }));
            }
          }

          for (var i = 0; i < data.length; i++) {
            if (include('APPLICATION')) {
              var deployments = data[i].deployments;
              for (var i2 = 0; i2 < deployments.length; i2++) {
                var deployment = deployments[i2].artifact;
                deployment.status = deployments[i2].lastReportedStatus;
                deployment.id = deployments[i2].id;
                deployment.type = 'APPLICATION';
                addOne(deployment);
              }
            }
            if (include('SERVER') && data[i].details && data[i].details.servers) {
              var servers = data[i].details.servers;
              for (var _i2 = 0; _i2 < servers.length; _i2++) {
                var server = servers[_i2].details;
                server.id = servers[_i2].id;
                server.name = servers[_i2].name;
                server.status = servers[_i2].status;
                server.type = 'SERVER';
                server.parent = data[i].name;
                server.parentType = data[i].type;
                server.addresses = JSON.stringify(server.addresses);
                addOne(server);
              }
            }
            if (include(data[i].type)) {
              addOne(data[i]);
            }
          }
          if (jsonPath) {
            rows = JSONPath({ path: jsonPath, json: rows }).map(function (obj) {
              return columns.map(function (x) {
                return obj[x.text] || '';
              });
            });
          }
          return {
            columns: columns,
            rows: rows,
            type: 'table'
          };
        });
      }).catch(function (error) {
        console.log(error);
        throw error;
      });

      // if (target.type === 'RUNTIME_MANAGER_RESOURCES') {
      //   return this.doRuntimeManagerResourceQuery(target,options)
      // } else {
      //   return new Promise(function (resolve, reject) {
      //     return resolve([])
      //   })
      // }

      // console.log('>>>', targetOrganization, targetEnvironment)
      // if (targetOrganization !== target.organization) {
      //   if (this.organizationCache.idsByName[targetOrganization]) {
      //     targetOrganization = this.organizationCache.idsByName[targetOrganization]
      //   }
      // }
      // if (targetEnvironment !== target.environment) {
      //   if (_.get(this.environmentCache, [targetOrganization, targetEnvironment])) {
      //     targetEnvironment = this.environmentCache[targetOrganization][targetEnvironment]
      //   }
      // }
      // if (!targetOrganization || !targetEnvironment || !this.environments[targetOrganization]) {
      //   return []
      // }


      // // console.log(filter)

      // return this.doRequest({
      //   url: '/armui/api/v1/servers',
      //   headers: {
      //     'X-ANYPNT-ORG-ID': targetOrganization,
      //     'X-ANYPNT-ENV-ID': targetEnvironment
      //   }
      // }).then((data) => {
      //   if (!data) {
      //     throw new Error('No response received, possible invalid organization or environment.')
      //   } else if (data.status !== 200) {
      //     throw new Error("Status code " + data.status + " received")
      //   }
      //   data = data.data.data
      //   let resource = target.resource.toUpperCase();
      //   let typeIndex;
      //   let columns = [
      //     { 'text': 'type', 'type': 'string' },
      //     { 'text': 'name', 'type': 'string' },
      //     { 'text': 'organization', 'type': 'string' },
      //     { 'text': 'environment', 'type': 'string' },
      //     { 'text': 'status', 'type': 'string' },
      //     { 'text': 'id', 'type': 'string' },
      //     { 'text': 'organizationId', 'type': 'string' },
      //     { 'text': 'environmentId', 'type': 'string' },
      //     { 'text': 'statusCode', 'type': 'number' }
      //   ]
      //   if (resource === 'APPLICATION' || resource === 'ALL') {
      //     columns = [...columns,
      //     { 'text': 'fileChecksum', 'type': 'string' },
      //     { 'text': 'fileName', 'type': 'string' },
      //     { 'text': 'lastUpdateTime', 'type': 'string' }
      //     ]
      //   }
      //   if (resource === 'SERVER' || resource === 'ALL') {
      //     columns = [
      //       ...columns,
      //       { 'text': 'agentVersion', 'type': 'string' },
      //       { 'text': 'runtimeVersion', 'type': 'string' },
      //       { 'text': 'currentClusteringIp', 'type': 'string' },
      //       { 'text': 'addresses', 'type': 'string' },
      //       { 'text': 'parent', 'type': 'string' },
      //       { 'text': 'parentType', 'type': 'string' }
      //     ]
      //   }

      //   let response = {
      //     columns: columns,
      //     rows: [], type: 'table'
      //   }
      //   let organizationCache.namesById = this.organizationCache.namesById;
      //   let environmentNames = this.environmentNames;
      //   function mapOne(obj) {
      //     let statues = ['RUNNING', 'STARTED', 'DISCONNECTED', 'STOPPED', 'DEPLOYMENT_FAILED']
      //     let i;
      //     for (i = 0; i < statues.length; i++) {
      //       if (obj.status === statues[i]) {
      //         break;
      //       }
      //     }
      //     obj.statusCode = i + 1;
      //     obj.organizationId = targetOrganization
      //     obj.organization = organizationCache.namesById[targetOrganization]
      //     obj.environmentId = targetEnvironment
      //     obj.environment = environmentNames[targetEnvironment]
      //     response.rows.push(columns.map(x => obj[x.text] || ''))
      //   }

      //   for (let i = 0; i < data.length; i++) {

      //     if (resource === 'APPLICATION' || target.resource === 'ALL') {
      //       let deployments = data[i].deployments
      //       for (let i2 = 0; i2 < deployments.length; i2++) {
      //         let deployment = deployments[i2].artifact;
      //         deployment.status = deployments[i2].lastReportedStatus;
      //         deployment.id = deployments[i2].id;
      //         deployment.type = 'APPLICATION'
      //         mapOne(deployment)
      //       }
      //     }
      //     if ((resource === 'SERVER' || target.resource === 'ALL') && data[i].details && data[i].details.servers) {
      //       let servers = data[i].details.servers;
      //       for (let i2 = 0; i2 < servers.length; i2++) {
      //         let server = servers[i2].details;
      //         server.id = servers[i2].id;
      //         server.name = servers[i2].name;
      //         server.status = servers[i2].status;
      //         server.type = 'SERVER';
      //         server.parent = data[i].name;
      //         server.parentType = data[i].type
      //         server.addresses = JSON.stringify(server.addresses)
      //         mapOne(server)
      //       }
      //     }
      //     if (resource === data[i].type || resource === 'ALL') {
      //       mapOne(data[i])
      //     }
      //   }
      //   return [response];

      // }).catch(function (error) {
      //   console.log(error)
      //   throw error
      // })
      // var query = this.buildQueryParameters(options);
      // query.targets = query.targets.filter(t => !t.hide);

      // if (query.targets.length <= 0) {
      //   return this.q.when({ data: [] });
      // }

      // if (this.templateSrv.getAdhocFilters) {
      //   query.adhocFilters = this.templateSrv.getAdhocFilters(this.name);
      // } else {
      //   query.adhocFilters = [];
      // }

      // return this.doRequest({
      //   url: '/query',
      //   data: query,
      //   method: 'POST'
      // });
    }
  }, {
    key: 'login',
    value: function login() {
      var _this7 = this;

      clearTimeout(this.loginTimer);
      console.log('Getting access token');
      this.accessToken = '';
      return this.doRequest({
        url: '/accounts/login',
        method: 'POST',
        data: this.authData
      }).then(function (response) {
        if (!response) {
          _this7.accessToken = null;
          return { status: "error", message: "Invalid credentials" };
        } else if (response.status === 200) {
          _this7.accessToken = response.data.access_token;
          return _this7.getMyProfile().then(function (r) {
            r = r.data.access_token;
            var time = 1000 * r.expires_in - 30;
            if (time < 10000) {
              time = 10000;
            }
            console.log("reauthenticating in", time);
            _this7.loginTimer = setTimeout(function () {
              _this7.loginOrRetry();
            }, time);
            return { status: "success", message: "Data source is working, found " + _this7.organizationCache.list.length + " organizations" };
          });
        } else {
          _this7.accessToken = null;
          return { status: "failure", message: "Status code: " + response.status };
        }
      }).catch(function (err) {
        console.log(err);
        this.accessToken = null;
        return { status: "failure", message: "Unknown error, possible invalid url." };
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
      var _this8 = this;

      this.loadingProfile = true;
      return this.doRequest({
        url: '/accounts/api/me',
        method: 'GET'
      }).then(function (response) {
        _this8.organizationCache.list = [{ 'text': 'All', value: '*' }].concat(_toConsumableArray(response.data.user.memberOfOrganizations.map(function (o, i) {
          response.data.user.memberOfOrganizations[i].resourceType = 'ORGANIZATION';
          _this8.organizationCache.idsByName[o.name] = o.id;
          _this8.organizationCache.namesById[o.id] = o.name;
          if (includeEnvironments !== false) {
            _this8.getEnvironments(o.id);
          }
          return { text: o.name, value: o.id };
        })));
        _this8.loadingProfile = false;
        return response;
      });
    }
  }, {
    key: 'getEnvironments',
    value: function getEnvironments(targetOrganization) {
      var _this9 = this;

      this.loadingEnvironment++;
      var organization = this.templateSrv.replace(targetOrganization, null);
      if (targetOrganization !== organization && this.organizationCache.idsByName[organization]) {
        organization = this.organizationCache.idsByName[organization];
      }
      return this.doRequest({
        url: '/accounts/api/organizations/' + organization + '/environments',
        method: 'GET'
      }).then(function (response) {
        _this9.environmentCache[organization] = { idsByName: {}, namesById: {} };
        _this9.environmentList[organization] = [{ 'text': 'All', value: '*' }].concat(_toConsumableArray(response.data.data.map(function (o) {
          _this9.environmentCache[organization].idsByName[o.name] = o.id;
          _this9.environmentCache[organization].namesById[o.id] = o.name;
          return { text: o.name, value: o.name };
        })));
        _this9.loadingEnvironment--;
        _this9.environmentList[organization];
        return response;
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
      var _this10 = this;

      options.headers = options.headers || {};
      if (!options.url.endsWith('/accounts/login')) {
        if (this.accessToken == null) {
          this.login();
        }
        if (this.accessToken === '') {
          return new Promise(function (resolve, reject) {
            setTimeout(function () {
              _this10.doRequest(options).then(resolve).catch(reject);
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
