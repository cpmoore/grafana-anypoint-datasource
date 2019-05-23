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

function delay(time) {
  return new Promise(function (resolve, reject) {
    setTimeout(resolve, time || 1000);
  });
}

var GenericDatasource = exports.GenericDatasource = function () {
  function GenericDatasource(instanceSettings, $q, backendSrv, templateSrv) {
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
    this.organizations = [];
    this.environments = {};
    this.organizationNames = {};
    this.environmentNames = {};
    this.loginTimer = setTimeout(this.loginOrRetry, 5000);
  }

  _createClass(GenericDatasource, [{
    key: 'loginOrRetry',
    value: function loginOrRetry() {
      var _this = this;

      this.login().then(function (response) {
        if (response.status === 'failure') {
          _this.loginTimer = setTimeout(_this.loginOrRetry, 5000);
        }
      });
    }
  }, {
    key: 'metricFindQuery',
    value: function metricFindQuery(query) {
      var interpolated = {
        target: this.templateSrv.replace(query, null, 'regex')
      };

      return this.doRequest({
        url: '/search',
        data: interpolated,
        method: 'POST'
      }).then(this.mapToTextValue);
    }
  }, {
    key: 'query',
    value: function query(options) {
      var _this2 = this;

      // No valid targets, return the empty result to save a round trip.
      if (_lodash2.default.isEmpty(options.targets)) {
        return this.$q.when({ data: [] });
      }
      var allQueryPromise = _lodash2.default.map(options.targets, function (target) {
        if (target.type === 'RUNTIME_MANAGER_RESOURCES') {
          return _this2.doRuntimeManagerResourceQuery(target);
        } else {
          return new Promise(function (resolve, reject) {
            return resolve([]);
          });
        }
      });
      return this.q.all(allQueryPromise).then(function (responseList) {
        var result = { data: [] };
        _lodash2.default.each(responseList, function (response, index) {
          result.data = [].concat(_toConsumableArray(result.data), _toConsumableArray(response));
        });
        return result;
      });
    }
  }, {
    key: 'doRuntimeManagerResourceQuery',
    value: function doRuntimeManagerResourceQuery(target) {
      var _this3 = this;

      var headers = {
        'X-ANYPNT-ORG-ID': this.templateSrv.replace(target.organization, null, 'regex'),
        'X-ANYPNT-ENV-ID': this.templateSrv.replace(target.environment, null, 'regex')
      };
      if (!headers['X-ANYPNT-ENV-ID'] || !headers['X-ANYPNT-ORG-ID']) {
        return [];
      }
      if (!this.environments.hasOwnProperty(headers['X-ANYPNT-ORG-ID'])) {
        return new Promise(function (resolve, reject) {
          setTimeout(function () {
            _this3.doRuntimeManagerResourceQuery(target).then(resolve).catch(reject);
          }, 1000);
        });
      }

      return this.doRequest({
        url: '/armui/api/v1/servers',
        headers: headers
      }).then(function (data) {
        if (!data) {
          throw new Error('No response received');
        } else if (data.status !== 200) {
          throw new Error("Status code " + data.status + " received");
        }
        data = data.data.data;

        var resource = target.resource.toUpperCase();
        var typeIndex = void 0;
        var columns = [{ 'text': 'type', 'type': 'string' }, { 'text': 'name', 'type': 'string' }, { 'text': 'organization', 'type': 'string' }, { 'text': 'environment', 'type': 'string' }, { 'text': 'status', 'type': 'string' }, { 'text': 'id', 'type': 'string' }, { 'text': 'organizationId', 'type': 'string' }, { 'text': 'environmentId', 'type': 'string' }, { 'text': 'statusCode', 'type': 'number' }];
        if (resource === 'APPLICATION' || resource === 'ALL') {
          columns = [].concat(_toConsumableArray(columns), [{ 'text': 'fileChecksum', 'type': 'string' }, { 'text': 'fileName', 'type': 'string' }, { 'text': 'lastUpdateTime', 'type': 'string' }]);
        }
        if (resource === 'SERVER' || resource === 'ALL') {
          columns = [].concat(_toConsumableArray(columns), [{ 'text': 'agentVersion', 'type': 'string' }, { 'text': 'runtimeVersion', 'type': 'string' }, { 'text': 'currentClusteringIp', 'type': 'string' }, { 'text': 'addresses', 'type': 'string' }, { 'text': 'parent', 'type': 'string' }, { 'text': 'parentType', 'type': 'string' }]);
        }

        var response = {
          columns: columns,
          rows: [], type: 'table'
        };
        var organizationNames = _this3.organizationNames;
        var environmentNames = _this3.environmentNames;
        function mapOne(obj) {
          var statues = ['RUNNING', 'STARTED', 'DISCONNECTED', 'STOPPED', 'DEPLOYMENT_FAILED'];
          var i = void 0;
          for (i = 0; i < statues.length; i++) {
            if (obj.status === statues[i]) {
              break;
            }
          }
          obj.statusCode = i + 1;
          obj.organizationId = headers['X-ANYPNT-ORG-ID'];
          obj.organization = organizationNames[headers['X-ANYPNT-ORG-ID']];
          obj.environmentId = headers['X-ANYPNT-ENV-ID'];
          obj.environment = environmentNames[headers['X-ANYPNT-ENV-ID']];
          response.rows.push(columns.map(function (x) {
            return obj[x.text] || '';
          }));
        }

        for (var i = 0; i < data.length; i++) {

          if (resource === 'APPLICATION' || target.resource === 'ALL') {
            var deployments = data[i].deployments;
            for (var i2 = 0; i2 < deployments.length; i2++) {
              var deployment = deployments[i2].artifact;
              deployment.status = deployments[i2].lastReportedStatus;
              deployment.id = deployments[i2].id;
              deployment.type = 'APPLICATION';
              mapOne(deployment);
            }
          }
          if ((resource === 'SERVER' || target.resource === 'ALL') && data[i].details && data[i].details.servers) {
            var servers = data[i].details.servers;
            for (var _i = 0; _i < servers.length; _i++) {
              var server = servers[_i].details;
              server.id = servers[_i].id;
              server.name = servers[_i].name;
              server.status = servers[_i].status;
              server.type = 'SERVER';
              server.parent = data[i].name;
              server.parentType = data[i].type;
              server.addresses = JSON.stringify(server.addresses);
              mapOne(server);
            }
          }
          if (resource === data[i].type || resource === 'ALL') {
            mapOne(data[i]);
          }
        }
        return [response];
      }).catch(function (error) {
        console.log(error);
        throw error;
      });
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
      var _this4 = this;

      clearTimeout(this.loginTimer);
      console.log('Getting access token');
      this.accessToken = '';
      return this.doRequest({
        url: '/accounts/login',
        method: 'POST',
        data: this.authData
      }).then(function (response) {
        if (!response) {
          _this4.accessToken = null;
          return { status: "error", message: "Invalid credentials" };
        } else if (response.status === 200) {
          _this4.accessToken = response.data.access_token;
          _this4.doRequest({
            url: '/accounts/api/me',
            method: 'GET'
          }).then(function (r) {
            _this4.organizations = r.data.user.memberOfOrganizations.map(function (o) {
              _this4.organizationNames[o.id] = o.name;
              return { text: o.name, value: o.id };
            });
            r = r.data.access_token;
            var time = 1000 * r.expires_in - 30;
            if (time < 10000) {
              time = 10000;
            }
            console.log("reauthenticating in", time);
            _this4.loginTimer = setTimeout(_this4.loginOrRetry, time);
          });
          return { status: "success", message: "Data source is working" };
        } else {
          _this4.accessToken = null;
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

    // annotationQuery(options) {
    //   var query = this.templateSrv.replace(options.annotation.query, {}, 'glob');
    //   var annotationQuery = {
    //     range: options.range,
    //     annotation: {
    //       name: options.annotation.name,
    //       datasource: options.annotation.datasource,
    //       enable: options.annotation.enable,
    //       iconColor: options.annotation.iconColor,
    //       query: query
    //     },
    //     rangeRaw: options.rangeRaw
    //   };

    //   return this.doRequest({
    //     url: '/annotations',
    //     method: 'POST',
    //     data: annotationQuery
    //   }).then(result => {
    //     return result.data;
    //   });
    // }


  }, {
    key: 'getOrganizations',
    value: function getOrganizations() {
      var _this5 = this;

      return this.doRequest({
        url: '/accounts/api/me',
        method: 'GET'
      }).then(function (response) {
        _this5.organizations = response.data.user.memberOfOrganizations.map(function (o) {
          _this5.organizationNames[o.id] = o.name;
          return { text: o.name, value: o.id };
        });
        return _this5.organizations;
      });
    }
  }, {
    key: 'getEnvironments',
    value: function getEnvironments(organization) {
      var _this6 = this;

      if (this.environments[organization]) {
        return new Promise(function (resolve, reject) {
          resolve(_this6.environments[organization]);
        });
      }
      this.currentOrganization = organization;
      organization = this.templateSrv.replace(organization, null, 'regex');
      return this.doRequest({
        url: '/accounts/api/organizations/' + organization + '/environments',
        method: 'GET'
      }).then(function (response) {
        _this6.environments[organization] = response.data.data.map(function (o) {
          _this6.environmentNames[o.id] = o.name;
          return { text: o.name, value: o.id };
        });
        return _this6.environments[organization];
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
      var _this7 = this;

      options.headers = options.headers || {};
      if (!options.url.endsWith('/accounts/login')) {
        if (this.accessToken == null) {
          this.login();
        }
        if (this.accessToken === '') {
          return new Promise(function (resolve, reject) {
            setTimeout(function () {
              _this7.doRequest(options).then(resolve).catch(reject);
            }, 1000);
          });
        }
        options.headers['Authorization'] = 'bearer ' + this.accessToken;
      }
      for (var x in this.headers) {
        options.headers[x] = this.headers[x];
      }
      options.url = this.url + options.url;
      return this.backendSrv.datasourceRequest(options);
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
