'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GenericDatasourceQueryCtrl = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _sdk = require('app/plugins/sdk');

require('./css/query-editor.css!');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var GenericDatasourceQueryCtrl = exports.GenericDatasourceQueryCtrl = function (_QueryCtrl) {
  _inherits(GenericDatasourceQueryCtrl, _QueryCtrl);

  function GenericDatasourceQueryCtrl($scope, $injector) {
    _classCallCheck(this, GenericDatasourceQueryCtrl);

    var _this = _possibleConstructorReturn(this, (GenericDatasourceQueryCtrl.__proto__ || Object.getPrototypeOf(GenericDatasourceQueryCtrl)).call(this, $scope, $injector));

    _this.scope = $scope;
    _this.target.type = _this.target.type || 'resources';
    _this.target.organization = _this.target.organization || '';
    _this.target.environment = _this.target.environment || '';
    _this.target.resource = _this.target.resource || 'ALL';
    _this.targetTypes = [{ 'value': 'ACCOUNT_RESOURCES', 'text': "Account Resources" }, { 'value': 'RUNTIME_MANAGER_RESOURCES', 'text': "Runtime Manager Resources" }];
    _this.resourceTypes = {
      'ACCOUNT_RESOURCES': [{ 'value': 'ALL', 'text': 'All' }, { 'value': 'ORGANIZATION', 'text': 'Organizations' }, { 'value': 'ENVIRONMENT', 'text': 'Environments' }],
      'RUNTIME_MANAGER_RESOURCES': [{ 'value': 'ALL', 'text': 'All' }, { 'value': 'APPLICATION', 'text': 'Applications' }, { 'value': 'SERVER', 'text': 'Servers' }, { 'value': 'SERVER_GROUP', 'text': 'Server Groups' }, { 'value': 'CLUSER', 'text': 'Clusters' }]
    };
    _this.previousOrganization = _this.target.organization;

    return _this;
  }

  _createClass(GenericDatasourceQueryCtrl, [{
    key: 'getResourceTypes',
    value: function getResourceTypes() {
      var _this2 = this;

      return new Promise(function (resolve) {
        resolve(_this2.resourceTypes[_this2.target.type]);
      });
    }
  }, {
    key: 'getOrganizations',
    value: function getOrganizations() {
      var _this3 = this;

      return new Promise(function (resolve) {
        if (_this3.datasource.organizationCache.list.length) {
          return resolve(_this3.datasource.organizationCache.list);
        }
        setTimeout(function () {
          _this3.getOrganizations().then(resolve);
        }, 1000);
      });
    }
  }, {
    key: 'getEnvironments',
    value: function getEnvironments() {
      return this.datasource.promiseMultipleEnvironments({
        organization: this.target.organization,
        environment: '*'
      }, {}, function (org, env, orgName, envName) {
        return envName;
      }).then(function (d) {
        var all = [{ 'value': '*', 'text': "All" }];
        var found = new Set(['*']);
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
      this.target.resource = this.resourceTypes[this.target.type][0].value;
      this.refresh();
    }
  }, {
    key: 'refresh',
    value: function refresh() {
      this.panelCtrl.refresh();
    }
  }]);

  return GenericDatasourceQueryCtrl;
}(_sdk.QueryCtrl);

GenericDatasourceQueryCtrl.templateUrl = 'partials/query.editor.html';
//# sourceMappingURL=query_ctrl.js.map
