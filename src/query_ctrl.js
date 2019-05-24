import { QueryCtrl } from 'app/plugins/sdk';
import './css/query-editor.css!'

export class GenericDatasourceQueryCtrl extends QueryCtrl {
  constructor($scope, $injector) {
    super($scope, $injector);

    this.scope = $scope;
    this.target.type = this.target.type || 'resources';
    this.target.organization = this.target.organization || ''
    this.target.environment = this.target.environment || ''
    this.target.resource = this.target.resource || 'ALL';
    this.targetTypes = [
      { 'value': 'ACCOUNT_RESOURCES', 'text': "Account Resources" },
      { 'value': 'RUNTIME_MANAGER_RESOURCES', 'text': "Runtime Manager Resources" }
    ]
    this.resourceTypes = {
      'ACCOUNT_RESOURCES': [
        { 'value': 'ALL', 'text': 'All' },
        { 'value': 'ORGANIZATION', 'text': 'Organizations' },
        { 'value': 'ENVIRONMENT', 'text': 'Environments' }
      ],
      'RUNTIME_MANAGER_RESOURCES': [
        { 'value': 'ALL', 'text': 'All' },
        { 'value': 'APPLICATION', 'text': 'Applications' },
        { 'value': 'SERVER', 'text': 'Servers' },
        { 'value': 'SERVER_GROUP', 'text': 'Server Groups' },
        { 'value': 'CLUSER', 'text': 'Clusters' }
      ]
    }
    this.previousOrganization = this.target.organization

  }
  getResourceTypes() {
    return new Promise((resolve) => {
      resolve(this.resourceTypes[this.target.type])
    })
  }
  getOrganizations() {
    return new Promise((resolve) => {
      if (this.datasource.organizationCache.list.length) {
        return resolve(this.datasource.organizationCache.list)
      }
      setTimeout(() => {
        this.getOrganizations().then(resolve)
      }, 1000)
    })
  }
  getEnvironments() {
    return this.datasource.promiseMultipleEnvironments({
      organization: this.target.organization,
      environment: '*'
    }, {},(org, env, orgName, envName) => envName).then((d) => {
      let all = [
        {'value':'*','text':"All"}
      ]
      let found = new Set();
      for (let i = 0; i < d.length; i++) {
        if (!found.has(d[i])) {
          found.add(d[i])
          all.push({ value: d[i], text: d[i] })
        }
      }
      return all
    })
  }
  onTargetTypeChange() {
    this.target.resource = this.resourceTypes[this.target.type][0].value
    this.refresh()
  }
  refresh() {
    this.panelCtrl.refresh()
  }
}

GenericDatasourceQueryCtrl.templateUrl = 'partials/query.editor.html';

