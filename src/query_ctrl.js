import { QueryCtrl } from 'app/plugins/sdk';
import './css/query-editor.css!'

export class GenericDatasourceQueryCtrl extends QueryCtrl {
  constructor($scope, $injector) {
    super($scope, $injector);

    this.scope = $scope;
    this.organizations = [];
    this.target.type = this.target.type || 'resources';
    this.target.organization = this.target.organization || ''
    this.target.environment = this.target.environment || ''
    this.target.resource = this.target.resource || 'ALL';
    this.targetTypes = [
      { 'value': 'ACCOUNT_RESOURCES', 'text': "Account Resources" },
      { 'value': 'RUNTIME_MANAGER_RESOURCES', 'text': "Runtime Manager Resources" }
    ]
    this.resourceTypes = {
      'ACCOUNT_RESOURCES':[
        { 'value': 'ORGANIZATION', 'text': 'Organizations' },
        { 'value': 'ENVIRONMENT', 'text': 'Environments' }
      ],
      'RUNTIME_MANAGER_RESOURCES': [
        { 'value': 'ALL', 'text': 'All Runtime Manager Resources' },
        { 'value': 'APPLICATION', 'text': 'Applications' },
        { 'value': 'SERVER', 'text': 'Servers' },
        { 'value': 'SERVER_GROUP', 'text': 'Server Groups' },
        { 'value': 'CLUSER', 'text': 'Clusters' }
      ]
    }
    if (this.target.organization) {
      this.getEnvironments()
    } else {
      this.setOrganization();
    }
  }
  setTargetType(){
    this.target.resource=this.resourceTypes[this.target.type][0].value
    this.refresh()
  }
  setOrganization() {
    if (this.datasource.organizations.length) {
      return setTimeout(this.setOrganization, 1000)
    }
    this.target.organization = this.datasource.organizations[0].value;
    this.getEnvironments()
  }
  getEnvironments() {
    let organization = this.target.organization
    let environmentName = this.datasource.environmentNames[this.target.environment]

    return this.datasource.getEnvironments(organization).then((response) => {
      let newEnv;
      for (let i = 0; i < response.length; i++) {
        let env = response[i];
        if (env.value === this.target.environment) {
          return response;
        }
        if (env.text === environmentName) {
          newEnv = env.value;
        }
      }
      if (!newEnv && response.length) {
        newEnv = response[0].value;
      }
      this.target.environment = newEnv
      this.refresh()
      return response
    });
  }
  refresh() {
    this.panelCtrl.refresh()
  }
}

GenericDatasourceQueryCtrl.templateUrl = 'partials/query.editor.html';

