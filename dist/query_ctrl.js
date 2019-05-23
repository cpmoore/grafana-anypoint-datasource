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
    _this.organizations = [];
    _this.target.type = _this.target.type || 'resources';
    _this.target.organization = _this.target.organization || '';
    _this.target.environment = _this.target.environment || '';
    _this.target.resource = _this.target.resource || 'ALL';
    _this.targetTypes = [{ 'value': 'ACCOUNT_RESOURCES', 'text': "Account Resources" }, { 'value': 'RUNTIME_MANAGER_RESOURCES', 'text': "Runtime Manager Resources" }];
    _this.resourceTypes = {
      'ACCOUNT_RESOURCES': [{ 'value': 'ORGANIZATION', 'text': 'Organizations' }, { 'value': 'ENVIRONMENT', 'text': 'Environments' }],
      'RUNTIME_MANAGER_RESOURCES': [{ 'value': 'ALL', 'text': 'All Runtime Manager Resources' }, { 'value': 'APPLICATION', 'text': 'Applications' }, { 'value': 'SERVER', 'text': 'Servers' }, { 'value': 'SERVER_GROUP', 'text': 'Server Groups' }, { 'value': 'CLUSER', 'text': 'Clusters' }]
    };
    if (_this.target.organization) {
      _this.getEnvironments();
    } else {
      _this.setOrganization();
    }
    return _this;
  }

  _createClass(GenericDatasourceQueryCtrl, [{
    key: 'setTargetType',
    value: function setTargetType() {
      this.target.resource = this.resourceTypes[this.target.type][0].value;
      this.refresh();
    }
  }, {
    key: 'setOrganization',
    value: function setOrganization() {
      if (this.datasource.organizations.length) {
        return setTimeout(this.setOrganization, 1000);
      }
      this.target.organization = this.datasource.organizations[0].value;
      this.getEnvironments();
    }
  }, {
    key: 'getEnvironments',
    value: function getEnvironments() {
      var _this2 = this;

      var organization = this.target.organization;
      var environmentName = this.datasource.environmentNames[this.target.environment];

      return this.datasource.getEnvironments(organization).then(function (response) {
        var newEnv = void 0;
        for (var i = 0; i < response.length; i++) {
          var env = response[i];
          if (env.value === _this2.target.environment) {
            return response;
          }
          if (env.text === environmentName) {
            newEnv = env.value;
          }
        }
        if (!newEnv && response.length) {
          newEnv = response[0].value;
        }
        _this2.target.environment = newEnv;
        _this2.refresh();
        return response;
      });
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
